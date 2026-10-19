"""Supabase relational gateway; credentials never leave this backend."""
import httpx

from .relational_codec import changes_between, decode_state, receipt_added


class Conflict(Exception):
    pass


class StorageUnavailable(Exception):
    pass


class AccessDenied(Exception):
    pass


class SupabaseRepository:
    def __init__(self, url, key, workspace, *, transport=None):
        self.url, self.key, self.workspace, self.transport = url.rstrip('/'), key, workspace, transport

    async def rpc(self, function, payload):
        headers = {'apikey': self.key, 'Content-Type': 'application/json'}
        # Legacy service-role keys are JWTs. New secret keys belong only in apikey.
        if self.key.startswith('eyJ'):
            headers['Authorization'] = f'Bearer {self.key}'
        async with httpx.AsyncClient(timeout=20, transport=self.transport) as client:
            response = await client.post(f'{self.url}/rest/v1/rpc/{function}', headers=headers, json=payload)
        if response.status_code >= 400:
            error = response.json() if 'application/json' in response.headers.get('content-type', '') else {}
            if error.get('code') in ['40001', '23505']:
                raise Conflict()
            if error.get('code') == '42501':
                raise AccessDenied()
            raise StorageUnavailable()
        return response.json()

    @staticmethod
    def snapshot(value):
        if not value or 'tables' not in value:
            raise StorageUnavailable()
        return {'revision': value['revision'], 'data': decode_state(value['tables'])}

    async def load(self, request_id=None):
        value = await self.rpc('licihub_crm_state', {'p_workspace_id': self.workspace, 'p_request_id': request_id})
        return self.snapshot(value)

    async def save(self, data, revision, *, before, actor=None, integration=False):
        receipt = receipt_added(before['data'], data)
        value = await self.rpc('licihub_crm_commit', {
            'p_workspace_id': self.workspace, 'p_revision': revision,
            'p_changes': changes_between(before['data'], data, self.workspace),
            'p_request_id': receipt['id'], 'p_digest': receipt['digest'],
            'p_actor_user_id': (actor or {}).get('id'), 'p_integration': integration,
        })
        return self.snapshot(value)

    async def member(self, user_id):
        return await self.rpc('licihub_crm_member', {'p_workspace_id': self.workspace, 'p_user_id': user_id})
