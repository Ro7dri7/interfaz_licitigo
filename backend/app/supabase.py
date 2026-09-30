"""Cliente mínimo de PostgREST (la API REST de Supabase) sobre httpx."""

import json
from typing import Any

import httpx

from .config import get_settings


class SupabaseError(RuntimeError):
    def __init__(self, status: int, detalle: str):
        super().__init__(f"Supabase HTTP {status}: {detalle}")
        self.status = status
        self.detalle = detalle

    @property
    def mensaje(self) -> str:
        """El `message` de PostgREST (p. ej. el texto de un `raise exception` en una función)."""
        try:
            return str(json.loads(self.detalle).get("message") or "")
        except (ValueError, AttributeError):
            return ""


class Supabase:
    PAGE = 1000  # tope de filas por respuesta de PostgREST

    def __init__(self) -> None:
        s = get_settings()
        self._http = httpx.AsyncClient(
            base_url=f"{s.supabase_url.rstrip('/')}/rest/v1",
            headers={"apikey": s.supabase_secret_key, "Authorization": f"Bearer {s.supabase_secret_key}"},
            timeout=60,
        )

    async def close(self) -> None:
        await self._http.aclose()

    async def _request(self, method: str, path: str, **kw: Any) -> httpx.Response:
        resp = await self._http.request(method, path, **kw)
        if resp.status_code >= 400:
            raise SupabaseError(resp.status_code, resp.text[:500])
        return resp

    async def select(self, table: str, params: dict[str, str], limit: int | None = None) -> list[dict]:
        """GET paginado. `params` usa la sintaxis de PostgREST (select, order, filtros col=op.valor)."""
        filas: list[dict] = []
        offset = 0
        while True:
            page = self.PAGE if limit is None else min(self.PAGE, limit - len(filas))
            resp = await self._request("GET", f"/{table}", params={**params, "limit": page, "offset": offset})
            lote = resp.json()
            filas.extend(lote)
            if len(lote) < page or (limit is not None and len(filas) >= limit):
                return filas
            offset += page

    async def count(self, table: str, params: dict[str, str] | None = None) -> int:
        resp = await self._request(
            "GET", f"/{table}", params={"select": "*", "limit": 1, **(params or {})}, headers={"Prefer": "count=exact"}
        )
        return int(resp.headers.get("content-range", "*/0").split("/")[-1])

    async def insert(self, table: str, rows: list[dict] | dict, on_conflict: str | None = None,
                     ignore_duplicates: bool = False, returning: bool = False) -> list[dict]:
        prefer = ["return=representation" if returning else "return=minimal"]
        if on_conflict:
            prefer.append("resolution=ignore-duplicates" if ignore_duplicates else "resolution=merge-duplicates")
        resp = await self._request(
            "POST", f"/{table}", json=rows, headers={"Prefer": ",".join(prefer)},
            params={"on_conflict": on_conflict} if on_conflict else None,
        )
        return resp.json() if returning else []

    async def update(self, table: str, filtros: dict[str, str], values: dict, returning: bool = False) -> list[dict]:
        resp = await self._request("PATCH", f"/{table}", params=filtros, json=values,
                                   headers={"Prefer": "return=representation" if returning else "return=minimal"})
        return resp.json() if returning else []

    async def delete(self, table: str, filtros: dict[str, str]) -> None:
        await self._request("DELETE", f"/{table}", params=filtros)

    async def rpc(self, funcion: str, args: dict[str, Any] | None = None) -> Any:
        """Llama a una función SQL (POST /rpc/<funcion>). Los argumentos None se omiten (usa el default)."""
        cuerpo = {k: v for k, v in (args or {}).items() if v is not None}
        resp = await self._request("POST", f"/rpc/{funcion}", json=cuerpo)
        return resp.json() if resp.content else None

    async def existe_tabla(self, table: str) -> bool:
        try:
            await self._request("GET", f"/{table}", params={"select": "*", "limit": 0})
            return True
        except SupabaseError as e:
            if e.status == 404 or "PGRST205" in e.detalle:
                return False
            raise


_db: Supabase | None = None


def get_db() -> Supabase:
    global _db
    if _db is None:
        _db = Supabase()
    return _db
