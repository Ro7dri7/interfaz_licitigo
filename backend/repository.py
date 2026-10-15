import json
import os
from pathlib import Path
from threading import Lock
from copy import deepcopy
import httpx


class Conflict(Exception):
    pass


class StorageUnavailable(Exception):
    pass


class LocalRepository:
    """Single-process pilot storage. Atomic replace; errors never reset existing data."""
    def __init__(self, path: Path, initial):
        self.path, self.lock = path, Lock()
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            self._write({'revision': 0, 'data': initial})

    def _write(self, snapshot):
        temporary = self.path.with_suffix('.tmp')
        with temporary.open('w', encoding='utf-8') as file:
            json.dump(snapshot, file, ensure_ascii=False, allow_nan=False)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, self.path)

    async def load(self):
        with self.lock:
            return json.loads(self.path.read_text(encoding='utf-8'))

    async def save(self, data, revision):
        with self.lock:
            current = json.loads(self.path.read_text(encoding='utf-8'))
            if current['revision'] != revision:
                raise Conflict()
            result = {'revision': revision + 1, 'data': deepcopy(data)}
            self._write(result)
            return result


class SupabaseRepository:
    def __init__(self, url, key, workspace):
        self.url, self.key, self.workspace = url.rstrip('/'), key, workspace

    async def request(self, method, path, **kwargs):
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.request(method, self.url + path,
                headers={'apikey': self.key, 'Authorization': f'Bearer {self.key}', 'Prefer': 'return=representation'}, **kwargs)
        if response.status_code >= 400:
            raise StorageUnavailable()
        return response.json()

    async def load(self):
        rows = await self.request('GET', '/rest/v1/crm_workspaces', params={'id': f'eq.{self.workspace}', 'select': 'revision,data'})
        if not rows:
            raise StorageUnavailable()
        return rows[0]

    async def save(self, data, revision):
        rows = await self.request('PATCH', '/rest/v1/crm_workspaces',
                                  params={'id': f'eq.{self.workspace}', 'revision': f'eq.{revision}'},
                                  json={'data': data, 'revision': revision + 1})
        if not rows:
            raise Conflict()
        return {'data': rows[0]['data'], 'revision': rows[0]['revision']}

    async def member(self, user_id):
        rows = await self.request('GET', '/rest/v1/crm_members', params={'workspace_id': f'eq.{self.workspace}',
                                  'user_id': f'eq.{user_id}', 'active': 'eq.true', 'select': 'display_name,role'})
        return rows[0] if rows else None
