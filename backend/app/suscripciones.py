"""
Suscripciones de alertas por Telegram (tablas telegram_suscripciones / telegram_alertas_enviadas).

Cada suscripción pertenece a una cuenta web (perfil_id) y usa el RUC de esa cuenta: el bot no registra empresas
por su cuenta. La web genera un enlace de un solo uso (t.me/<bot>?start=<token>) que vence en 24 h; al pulsar
Iniciar, el bot liga ese chat a la cuenta. Una cuenta = un chat, y un chat = una cuenta.
"""

import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx

from .config import get_settings
from .supabase import get_db

TABLA = "telegram_suscripciones"
TABLA_ENVIADAS = "telegram_alertas_enviadas"
VIGENCIA_ENLACE = timedelta(hours=24)


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _dt(s: str | None) -> datetime | None:
    try:
        d = datetime.fromisoformat(str(s))
    except (TypeError, ValueError):
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


async def bot_username() -> str | None:
    token = get_settings().telegram_bot_token
    if not token:
        return None
    async with httpx.AsyncClient(timeout=10) as http:
        resp = await http.get(f"https://api.telegram.org/bot{token}/getMe")
    return resp.json().get("result", {}).get("username") if resp.status_code == 200 else None


def enlaces(username: str, token: str) -> dict:
    """Enlace a la app, a Telegram Web y el comando para pegar a mano si ninguno abre."""
    tg = f"tg://resolve?domain={username}&start={token}"
    return {
        "url": f"https://t.me/{username}?start={token}",
        "urlWeb": f"https://web.telegram.org/k/#?tgaddr={quote(tg, safe='')}",
        "comando": f"/start {token}",
    }


# ----------------------------------------------------------------------------- web (cuenta)

async def crear_pendiente(perfil_id: str, ruc: str, razon_social: str | None, keywords: list[str],
                          ciius: list[str]) -> str:
    """Nuevo enlace para la cuenta. Los enlaces anteriores que nadie usó se descartan."""
    db = get_db()
    await db.delete(TABLA, {"perfil_id": f"eq.{perfil_id}", "chat_id": "is.null"})
    token = secrets.token_urlsafe(9)
    await db.insert(TABLA, {
        "token": token, "perfil_id": perfil_id, "ruc": ruc, "razon_social": razon_social,
        "keywords": keywords, "ciius": ciius,
    })
    return token


async def estado_de_perfil(perfil_id: str) -> dict:
    filas = await get_db().select(TABLA, {
        "select": "username,activo,vinculado_at", "perfil_id": f"eq.{perfil_id}", "chat_id": "not.is.null",
        "order": "vinculado_at.desc.nullslast",
    }, limit=1)
    if not filas:
        return {"vinculado": False, "username": None, "activo": False, "vinculadoEl": None}
    f = filas[0]
    return {"vinculado": True, "username": f.get("username"), "activo": bool(f.get("activo")),
            "vinculadoEl": f.get("vinculado_at")}


async def desvincular(perfil_id: str) -> None:
    """Quita el chat de la cuenta: deja de recibir alertas y el bot ya no la reconoce."""
    await get_db().delete(TABLA, {"perfil_id": f"eq.{perfil_id}"})


async def sincronizar_keywords(perfil_id: str, keywords: list[str]) -> None:
    """Las keywords editadas en la web se aplican también a las alertas."""
    await get_db().update(TABLA, {"perfil_id": f"eq.{perfil_id}"}, {"keywords": keywords})


# ----------------------------------------------------------------------------- bot

async def vincular(token: str, chat_id: int, username: str | None) -> tuple[dict | None, str]:
    """
    Liga el chat que abrió el enlace a la cuenta. Devuelve (suscripción, motivo); motivo es 'ok', 'invalido',
    'usado' (ya lo usó otro chat) o 'vencido'.
    """
    db = get_db()
    filas = await db.select(TABLA, {"select": "*", "token": f"eq.{token}"}, limit=1)
    if not filas or not filas[0].get("perfil_id"):
        return None, "invalido"
    sus = filas[0]
    if sus.get("chat_id") and sus["chat_id"] != chat_id:
        return None, "usado"
    creado = _dt(sus.get("creado_at"))
    if not sus.get("chat_id") and creado and _ahora() - creado > VIGENCIA_ENLACE:
        return None, "vencido"

    # Un chat = una cuenta, y una cuenta = un chat.
    await db.delete(TABLA, {"chat_id": f"eq.{chat_id}", "id": f"neq.{sus['id']}"})
    await db.delete(TABLA, {"perfil_id": f"eq.{sus['perfil_id']}", "id": f"neq.{sus['id']}"})
    cambios = {"chat_id": chat_id, "username": username, "activo": True, "vinculado_at": _ahora().isoformat()}
    await db.update(TABLA, {"id": f"eq.{sus['id']}"}, cambios)
    return {**sus, **cambios}, "ok"


async def de_chat(chat_id: int, incluir_pausadas: bool = False) -> dict | None:
    filtros = {"select": "*", "chat_id": f"eq.{chat_id}", "perfil_id": "not.is.null",
               "order": "vinculado_at.desc.nullslast"}
    if not incluir_pausadas:
        filtros["activo"] = "is.true"
    filas = await get_db().select(TABLA, filtros, limit=1)
    return filas[0] if filas else None


async def actualizar(sus_id: str, **cambios) -> None:
    await get_db().update(TABLA, {"id": f"eq.{sus_id}"}, cambios)


async def actualizar_keywords(sus: dict, keywords: list[str]) -> None:
    """Las keywords editadas en el bot se guardan también en la cuenta web."""
    db = get_db()
    await db.update(TABLA, {"id": f"eq.{sus['id']}"}, {"keywords": keywords})
    if sus.get("perfil_id"):
        await db.update("perfiles", {"id": f"eq.{sus['perfil_id']}"},
                        {"keywords": keywords, "updated_at": _ahora().isoformat()})


async def activas() -> list[dict]:
    return await get_db().select(TABLA, {"select": "*", "activo": "is.true", "chat_id": "not.is.null",
                                         "perfil_id": "not.is.null"})


async def enviadas(chat_id: int) -> set[int]:
    filas = await get_db().select(TABLA_ENVIADAS, {"select": "convocatoria_id", "chat_id": f"eq.{chat_id}"})
    return {f["convocatoria_id"] for f in filas}


async def marcar_enviadas(chat_id: int, ids: list[int]) -> None:
    if ids:
        await get_db().insert(TABLA_ENVIADAS, [{"chat_id": chat_id, "convocatoria_id": i} for i in ids],
                              on_conflict="chat_id,convocatoria_id", ignore_duplicates=True)
