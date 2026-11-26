"""
Cuentas de usuario con Supabase Auth (email + contraseña).

El navegador nunca habla con Supabase: el backend crea la cuenta con la API admin (confirmada, sin correo de
verificación), inicia sesión y valida el access token en cada petición. Cada cuenta tiene una fila en `perfiles`
(mismo id que auth.users) con su RUC, keywords y cupo de desbloqueos.
"""

import base64
import hashlib
import logging
import re
import secrets
import time
from dataclasses import dataclass
from typing import Annotated, Any
from urllib.parse import urlparse

import httpx
from fastapi import Header, HTTPException, Response

from .config import get_settings
from .supabase import SupabaseError, cabeceras_servicio, get_db

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
        headers=cabeceras_servicio(s.supabase_secret_key),
        timeout=20,
    )


def validar_contrasena(valor: str) -> str:
    """Registro y restablecimiento. El login acepta claves antiguas."""
    if (len(valor) < 8 or len(valor) > 72 or not re.search(r"[A-Z]", valor) or not re.search(r"[a-z]", valor)
            or not re.search(r"\d", valor) or not re.search(r"[!@#$%^&*]", valor)):
        raise ValueError(
            "La contraseña necesita 8 caracteres, una mayúscula, una minúscula, un número y un símbolo de !@#$%^&*."
        )
    return valor


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


def normalizar_telefono(valor: str | None) -> str:
    texto = re.sub(r"[^\d+]", "", (valor or "").strip())
    return texto[:30]


async def guardar_telefono(user_id: str, telefono: str) -> None:
    tel = normalizar_telefono(telefono)
    if len(re.sub(r"\D", "", tel)) < 8:
        return
    try:
        await get_db().update("perfiles", {"id": f"eq.{user_id}"}, {"telefono": tel})
    except SupabaseError as e:
        # Columna aún no migrada: no bloquea el registro.
        if e.status == 400 and "telefono" in e.detalle:
            log.warning("Falta ejecutar 013_telefono_perfil.sql en Supabase")
            return
        raise


async def registrar(nombre: str, email: str, password: str, telefono: str = "") -> dict:
    """Crea la cuenta (ya confirmada), su perfil y devuelve la sesión iniciada."""
    email = email.strip().lower()
    async with _http() as http:
        resp = await http.post(
            "/admin/users",
            headers=cabeceras_servicio(get_settings().supabase_secret_key),
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
    if telefono:
        await guardar_telefono(user_id, telefono)
    return await iniciar_sesion(email, password)


_COLUMNAS_PERFIL_NUEVO = ("rol", "creditos_desbloqueo", "plan_actual")


async def perfil_existe(user_id: str) -> bool:
    filas = await get_db().select("perfiles", {"select": "id", "id": f"eq.{user_id}"}, limit=1)
    return bool(filas)


async def asegurar_perfil(user_id: str, nombre: str) -> None:
    """Crea el perfil de cliente si no existe. No pisa créditos, RUC ni un perfil ya creado, ni escribe en miembros."""
    fila = {
        "id": user_id,
        "nombre_completo": nombre[:120],
        "rol": "cliente",
        "creditos_desbloqueo": 5,
        "plan_actual": "free",
    }
    for _ in range(len(_COLUMNAS_PERFIL_NUEVO) + 1):
        try:
            await get_db().insert("perfiles", fila, on_conflict="id", ignore_duplicates=True)
            return
        except SupabaseError as e:
            faltan = [col for col in _COLUMNAS_PERFIL_NUEVO if col in fila and col in e.detalle]
            if e.status != 400 or not faltan:
                raise
            for col in faltan:
                fila.pop(col, None)


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


# ----------------------------------------------------------------------------- rol y cookies del CRM

ROL_CLIENTE = "cliente"
_COOKIE_SESION = "lici_crm_session"
_COOKIE_REFRESH = "lici_crm_refresh"
_COOKIE_PATH = "/api/crm"
_REFRESH_MAX = 60 * 60 * 24 * 14
_tickets: dict[str, tuple[float, dict]] = {}


def volver_seguro(valor: str | None) -> str | None:
    """Solo rutas internas. Evita que el retorno del login salte a otro sitio."""
    if not valor or len(valor) > 200:
        return None
    if not valor.startswith("/") or valor.startswith("//") or "\\" in valor or "://" in valor:
        return None
    if any(c in valor for c in ("\r", "\n", "\x00")):
        return None
    return valor


def volver_cliente(valor: str | None) -> str | None:
    """Retorno del OAuth de clientes. El espacio comercial no se arrastra por esta entrada."""
    ruta = volver_seguro(valor)
    if not ruta or ruta == "/comercial" or ruta.startswith("/comercial/"):
        return None
    return ruta


PLANES_CLIENTE = frozenset({"explorador", "comercial", "empresarial"})


def plan_seguro(valor: str | None) -> str | None:
    plan = (valor or "").strip().lower()
    return plan if plan in PLANES_CLIENTE else None


def codigo_pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return verifier, challenge


def guardar_ticket(sesion: dict) -> str:
    ahora = time.time()
    vencidos = [k for k, (expira, _) in _tickets.items() if expira < ahora]
    for k in vencidos:
        _tickets.pop(k, None)
    ticket = secrets.token_urlsafe(32)
    _tickets[ticket] = (ahora + 120, sesion)
    return ticket


def leer_ticket(ticket: str) -> dict | None:
    """Se puede canjear más de una vez dentro de los 2 minutos: el efecto de React se dispara dos veces."""
    item = _tickets.get(ticket)
    if not item or item[0] < time.time():
        _tickets.pop(ticket, None)
        return None
    return item[1]


def poner_cookies_crm(response: Response, access: str, refresh: str, expires_in: int) -> None:
    response.set_cookie(_COOKIE_SESION, access, httponly=True, secure=True, samesite="strict",
                        max_age=max(60, min(int(expires_in or 3600), 3600)), path=_COOKIE_PATH)
    response.set_cookie(_COOKIE_REFRESH, refresh, httponly=True, secure=True, samesite="strict",
                        max_age=_REFRESH_MAX, path=_COOKIE_PATH)


def borrar_cookie_pkce(response: Response) -> None:
    for nombre in ("lici_pkce", "lici_volver", "lici_plan"):
        response.delete_cookie(nombre, path="/api/auth/google", secure=True, httponly=True, samesite="lax")


def borrar_cookies_crm(response: Response) -> None:
    for nombre in (_COOKIE_SESION, _COOKIE_REFRESH):
        response.delete_cookie(nombre, path=_COOKIE_PATH, secure=True, httponly=True, samesite="strict")


def aplicar_cookies(response: Response, sesion: dict) -> None:
    if sesion.get("rol") in ("admin", "commercial"):
        vence = int(sesion.get("expiresAt") or 0) - int(time.time())
        poner_cookies_crm(response, sesion["accessToken"], sesion["refreshToken"], vence)
    else:
        borrar_cookies_crm(response)


async def rol_comercial(user_id: str) -> str:
    """admin o commercial si hay membresía activa en el espacio configurado. Si no, cliente. No crea miembros."""
    espacio = get_settings().crm_workspace_id
    if not espacio or not user_id:
        return ROL_CLIENTE
    try:
        miembro = await get_db().rpc("licihub_crm_miembro", {"p_espacio_id": espacio, "p_usuario_id": user_id})
    except SupabaseError:
        log.warning("No se pudo leer la membresía comercial de %s", user_id)
        return ROL_CLIENTE
    rol = miembro.get("rol") if isinstance(miembro, dict) else None
    return rol if rol in ("admin", "commercial") else ROL_CLIENTE


async def con_rol(datos: dict) -> dict:
    sesion = _sesion(datos)
    if not sesion["usuario"]["nombre"]:
        sesion["usuario"]["nombre"] = nombre_de_usuario(datos.get("user") or {})
    sesion["rol"] = await rol_comercial(sesion["usuario"]["id"] or "")
    return sesion


def origen_de_peticion(proto: str, host: str) -> str:
    configurado = get_settings().public_origin
    if configurado:
        return configurado
    proto = (proto or "").split(",")[0].strip().lower()
    host = (host or "").split(",")[0].strip()
    if proto in ("http", "https") and host and " " not in host and "/" not in host:
        return f"{proto}://{host}"
    return "https://127.0.0.1:5174"


async def url_google(redirect_to: str, challenge: str) -> str:
    """Pide a Supabase la redirección a Google.

    /authorize solo acepta la clave publicable. La clave secreta no se envía: GoTrue responde 400.
    """
    s = get_settings()
    clave = (s.supabase_publishable_key or "").strip()
    if not clave:
        log.warning("Falta SUPABASE_PUBLISHABLE_KEY para iniciar Google")
        raise AuthError(503, "Google todavía no está disponible. Actívalo en Supabase Auth y vuelve a intentarlo.")
    headers = {"apikey": clave}
    if clave.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {clave}"
    async with httpx.AsyncClient(base_url=f"{s.supabase_url.rstrip('/')}/auth/v1", headers=headers, timeout=20) as http:
        resp = await http.get("/authorize", params={
            "provider": "google", "redirect_to": redirect_to,
            "code_challenge": challenge, "code_challenge_method": "s256",
        }, follow_redirects=False)
    location = resp.headers.get("location") or ""
    host = (urlparse(location).hostname or "").lower()
    if resp.status_code not in (301, 302, 303, 307, 308) or host != "accounts.google.com":
        log.warning("Supabase authorize HTTP %s redirect_to=%s detalle=%s",
                    resp.status_code, redirect_to, _msg(resp)[:180])
        raise AuthError(503, "Google todavía no está disponible. Actívalo en Supabase Auth y vuelve a intentarlo.")
    return location


async def intercambiar_codigo(code: str, verifier: str) -> dict:
    async with _http() as http:
        resp = await http.post("/token", params={"grant_type": "pkce"},
                               json={"auth_code": code, "code_verifier": verifier})
    if resp.status_code >= 400:
        log.warning("Supabase PKCE HTTP %s", resp.status_code)
        raise AuthError(401, "No pudimos completar el ingreso con Google. Vuelve a intentarlo.")
    return resp.json()


async def enviar_otp(email: str) -> None:
    async with _http() as http:
        resp = await http.post("/otp", json={"email": email, "create_user": True})
    if resp.status_code == 429:
        raise AuthError(429, "Demasiados códigos. Espera unos minutos e inténtalo de nuevo.")
    if resp.status_code >= 400:
        log.warning("Supabase OTP HTTP %s", resp.status_code)
        raise AuthError(503, "No pudimos enviar el código. Inténtalo de nuevo.")


async def verificar_otp(email: str, token: str) -> dict:
    async with _http() as http:
        resp = await http.post("/verify", json={"email": email, "token": token, "type": "email"})
    if resp.status_code in (400, 401, 403):
        raise AuthError(401, "El código no es válido o ya venció.")
    if resp.status_code >= 400:
        log.warning("Supabase verify HTTP %s", resp.status_code)
        raise AuthError(503, "No pudimos verificar el código. Inténtalo de nuevo.")
    return resp.json()


async def recuperar_contrasena(email: str, redirect_to: str) -> None:
    async with _http() as http:
        resp = await http.post("/recover", params={"redirect_to": redirect_to}, json={"email": email})
    if resp.status_code == 429:
        raise AuthError(429, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.")
    if resp.status_code >= 500:
        log.warning("Supabase recover HTTP %s", resp.status_code)
        raise AuthError(503, "No pudimos enviar el correo. Inténtalo de nuevo.")


async def cambiar_contrasena(access_token: str, password: str) -> None:
    async with _http() as http:
        resp = await http.put("/user", headers={"Authorization": f"Bearer {access_token}"}, json={"password": password})
    if resp.status_code >= 400:
        raise AuthError(400, "El enlace venció o la contraseña no es válida. Pide uno nuevo.")


def nombre_de_usuario(user: dict) -> str:
    meta = user.get("user_metadata") or {}
    return str(meta.get("nombre") or meta.get("full_name") or meta.get("name") or user.get("email") or "Cuenta")[:120]
