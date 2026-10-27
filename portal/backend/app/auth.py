"""
Cuentas de usuario con Supabase Auth (email + contraseña).

El navegador nunca habla con Supabase: el backend crea la cuenta con la API admin (confirmada, sin correo de
verificación), inicia sesión y valida el access token en cada petición. Cada cuenta tiene una fila en `perfiles`
(mismo id que auth.users) con su RUC, keywords y cupo de desbloqueos.
"""

import hashlib
import logging
import time
from dataclasses import dataclass
from typing import Annotated, Any

import httpx
from fastapi import Header, HTTPException

from .config import get_settings
from .supabase import SupabaseError, get_db

log = logging.getLogger(__name__)

_CACHE_SEG = 60
_cache_tokens: dict[str, tuple[float, dict]] = {}


class AuthError(Exception):
    def __init__(self, status: int, mensaje: str):
        super().__init__(mensaje)
        self.status = status
        self.mensaje = mensaje


@dataclass
class Usuario:
    id: str
    email: str
    nombre: str


def _http() -> httpx.AsyncClient:
    s = get_settings()
    return httpx.AsyncClient(
        base_url=f"{s.supabase_url.rstrip('/')}/auth/v1",
        headers={"apikey": s.supabase_secret_key},
        timeout=20,
    )


def _msg(resp: httpx.Response) -> str:
    try:
        data = resp.json()
    except ValueError:
        return resp.text[:200]
    return str(data.get("msg") or data.get("message") or data.get("error_description") or data.get("error") or "")


def _sesion(data: dict) -> dict:
    user = data.get("user") or {}
    meta = user.get("user_metadata") or {}
    return {
        "accessToken": data["access_token"],
        "refreshToken": data["refresh_token"],
        "expiresAt": int(data.get("expires_at") or time.time() + int(data.get("expires_in") or 3600)),
        "usuario": {"id": user.get("id"), "email": user.get("email"), "nombre": meta.get("nombre") or ""},
    }


async def iniciar_sesion(email: str, password: str) -> dict:
    async with _http() as http:
        resp = await http.post("/token", params={"grant_type": "password"},
                               json={"email": email.strip().lower(), "password": password})
    if resp.status_code in (400, 401):
        raise AuthError(401, "Correo o contraseña incorrectos.")
    if resp.status_code == 429:
        raise AuthError(429, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.")
    if resp.status_code >= 400:
        log.warning("Supabase Auth /token HTTP %s: %s", resp.status_code, _msg(resp))
        raise AuthError(503, "No pudimos iniciar sesión en este momento.")
    return _sesion(resp.json())


async def refrescar(refresh_token: str) -> dict:
    async with _http() as http:
        resp = await http.post("/token", params={"grant_type": "refresh_token"},
                               json={"refresh_token": refresh_token})
    if resp.status_code >= 400:
        raise AuthError(401, "Tu sesión expiró. Vuelve a iniciar sesión.")
    return _sesion(resp.json())


async def registrar(nombre: str, email: str, password: str) -> dict:
    """Crea la cuenta (ya confirmada), su perfil y devuelve la sesión iniciada."""
    email = email.strip().lower()
    async with _http() as http:
        resp = await http.post(
            "/admin/users",
            headers={"Authorization": f"Bearer {get_settings().supabase_secret_key}"},
            json={"email": email, "password": password, "email_confirm": True, "user_metadata": {"nombre": nombre}},
        )
    if resp.status_code == 409 or (resp.status_code == 422 and "already" in _msg(resp).lower()):
        raise AuthError(409, "Ya existe una cuenta con ese correo. Inicia sesión.")
    if resp.status_code in (400, 422):
        raise AuthError(422, _msg(resp) or "Datos de registro inválidos.")
    if resp.status_code >= 400:
        log.warning("Supabase Auth /admin/users HTTP %s: %s", resp.status_code, _msg(resp))
        raise AuthError(503, "No pudimos crear la cuenta en este momento.")
    user_id = resp.json()["id"]
    await asegurar_perfil(user_id, nombre or email)
    return await iniciar_sesion(email, password)


async def asegurar_perfil(user_id: str, nombre: str) -> None:
    await get_db().insert("perfiles", {"id": user_id, "nombre_completo": nombre[:120]},
                          on_conflict="id", ignore_duplicates=True)


async def _usuario_de_token(token: str) -> dict:
    clave = hashlib.sha256(token.encode()).hexdigest()
    ahora = time.monotonic()
    hit = _cache_tokens.get(clave)
    if hit and ahora - hit[0] < _CACHE_SEG:
        return hit[1]
    async with _http() as http:
        resp = await http.get("/user", headers={"Authorization": f"Bearer {token}"})
    if resp.status_code in (401, 403):
        raise AuthError(401, "Tu sesión expiró. Vuelve a iniciar sesión.")
    if resp.status_code >= 400:
        raise AuthError(503, "No pudimos validar tu sesión en este momento.")
    user = resp.json()
    if len(_cache_tokens) > 5000:
        _cache_tokens.clear()
    _cache_tokens[clave] = (ahora, user)
    return user


async def usuario_actual(authorization: Annotated[str | None, Header()] = None) -> Usuario:
    """Dependencia de FastAPI: exige `Authorization: Bearer <access token>`."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Inicia sesión para continuar.")
    try:
        user = await _usuario_de_token(authorization[7:].strip())
    except AuthError as e:
        raise HTTPException(e.status, e.mensaje) from e
    meta: dict[str, Any] = user.get("user_metadata") or {}
    return Usuario(id=user["id"], email=user.get("email") or "", nombre=meta.get("nombre") or "")


async def perfil(usuario: Usuario) -> dict:
    """Fila de `perfiles` del usuario (la crea si falta, p. ej. cuentas creadas desde el panel de Supabase)."""
    db = get_db()
    filas = await db.select("perfiles", {"select": "*", "id": f"eq.{usuario.id}"}, limit=1)
    if filas:
        return filas[0]
    try:
        await asegurar_perfil(usuario.id, usuario.nombre or usuario.email)
    except SupabaseError as e:
        raise HTTPException(503, "No pudimos preparar tu perfil.") from e
    filas = await db.select("perfiles", {"select": "*", "id": f"eq.{usuario.id}"}, limit=1)
    return filas[0]
