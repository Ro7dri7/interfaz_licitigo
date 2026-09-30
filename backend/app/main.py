"""API HTTP de Lici. Ejecutar con:  uvicorn app.main:app --reload --port 8000"""

import asyncio
import logging
import math
import re
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field, field_validator

from . import auth, desbloqueos, licitaciones, suscripciones
from .auth import AuthError, Usuario, usuario_actual
from .config import get_settings
from .desbloqueos import DesbloqueoError
from .empresa import EmpresaNoEncontrada, ciius_guardados, empresa_guardada, obtener_empresa, ruc_valido
from .supabase import SupabaseError, get_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("lici.api")

MAX_KEYWORDS = 30
MAX_LARGO_KEYWORD = 80


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await get_db().close()


app = FastAPI(title="Lici API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origins.split(",") if o.strip()],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(SupabaseError)
async def _error_supabase(_: Request, e: SupabaseError) -> JSONResponse:
    log.error("Supabase: %s", e)
    return JSONResponse({"detail": "La base de datos no respondió como se esperaba. Inténtalo de nuevo."}, 503)


@app.exception_handler(httpx.HTTPError)
async def _error_red(_: Request, e: httpx.HTTPError) -> JSONResponse:
    log.error("Error de red: %r", e)
    return JSONResponse({"detail": "No pudimos conectar con un servicio externo. Inténtalo de nuevo."}, 503)


@app.exception_handler(AuthError)
async def _error_auth(_: Request, e: AuthError) -> JSONResponse:
    return JSONResponse({"detail": e.mensaje}, e.status)


@app.exception_handler(DesbloqueoError)
async def _error_desbloqueo(_: Request, e: DesbloqueoError) -> JSONResponse:
    return JSONResponse({"detail": e.mensaje}, e.status)


_RE_CIIU = re.compile(r"^\d{4}$")


def _ciius(valor: str | None) -> list[str]:
    return [c for c in (valor or "").replace(" ", "").split(",") if _RE_CIIU.match(c)]


_cache_ciius: dict[str, tuple[float, list[str]]] = {}


async def ciius_de_busqueda(ruc: str) -> list[str]:
    """
    CIIU con los que se busca: los oficiales de SUNAT si los hay; si no, los inferidos. El flujo n8n agrega CIIU
    inferidos por heurística al analizar una licitación y no deben ampliar las recomendaciones. Cache de 5 min.
    """
    hit = _cache_ciius.get(ruc)
    if hit and time.monotonic() - hit[0] < 300:
        return hit[1]
    todos = await ciius_guardados(ruc)
    oficiales = [c["codigo"] for c in todos if c["origen"] == "oficial"]
    lista = oficiales or [c["codigo"] for c in todos]
    _cache_ciius[ruc] = (time.monotonic(), lista)
    return lista


def limpiar_keywords(kws: list[str] | None) -> list[str]:
    """Mayúsculas, sin espacios repetidos ni duplicados, con tope de cantidad y largo."""
    vistas: list[str] = []
    for k in kws or []:
        k = re.sub(r"\s+", " ", str(k)).strip().upper()[:MAX_LARGO_KEYWORD]
        if len(k) >= 3 and k not in vistas:
            vistas.append(k)
    return vistas[:MAX_KEYWORDS]


# ----------------------------------------------------------------------------- salud y datos públicos

@app.get("/api/health")
async def health() -> dict:
    s = get_settings()
    return {
        "ok": True,
        "tablasBackend": await get_db().existe_tabla("desbloqueos"),
        "telegramConfigurado": bool(s.telegram_bot_token),
        "analisisIaConfigurado": bool(s.n8n_webhook_url),
    }


@app.get("/api/estadisticas")
async def estadisticas() -> dict:
    return await licitaciones.estadisticas()


@app.get("/api/empresas/{ruc}")
async def empresa(ruc: str) -> dict:
    ruc = re.sub(r"\D", "", ruc)
    if not ruc_valido(ruc):
        raise HTTPException(422, "El RUC debe tener 11 dígitos y empezar con 10, 15, 17 o 20.")
    try:
        return await obtener_empresa(ruc)
    except EmpresaNoEncontrada as e:
        raise HTTPException(404, str(e)) from e


@app.get("/api/terminos")
async def terminos(ciius: str | None = None, ruc: str | None = None,
                   limite: Annotated[int, Query(ge=1, le=30)] = 12) -> list[dict]:
    """Keywords sugeridas: términos más licitados para los CIIU y el historial del RUC."""
    lista = _ciius(ciius)
    ruc = re.sub(r"\D", "", ruc or "") or None
    if ruc and not ruc_valido(ruc):
        raise HTTPException(422, "RUC inválido.")
    if not lista and not ruc:
        raise HTTPException(422, "Indica al menos un CIIU de 4 dígitos o un RUC.")
    if not lista and ruc:
        lista = await ciius_de_busqueda(ruc)
    return await licitaciones.terminos_mas_licitados(lista, limite, ruc=ruc)


@app.get("/api/keywords/conteo")
async def conteo_keyword(keyword: Annotated[str, Query(min_length=3, max_length=MAX_LARGO_KEYWORD)]) -> dict:
    """Cuántas convocatorias abiertas calzan con una keyword escrita a mano."""
    kw = limpiar_keywords([keyword])
    if not kw:
        raise HTTPException(422, "La keyword debe tener al menos 3 letras.")
    return {"keyword": kw[0], "abiertas": await licitaciones.contar_keyword(kw[0])}


# ----------------------------------------------------------------------------- cuentas

class Registro(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)

    @field_validator("nombre")
    @classmethod
    def _nombre(cls, v: str) -> str:
        return re.sub(r"\s+", " ", v).strip()


class Login(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class Refresh(BaseModel):
    refreshToken: str = Field(min_length=10, max_length=2000)


@app.post("/api/auth/registro")
async def registro(body: Registro) -> dict:
    return await auth.registrar(body.nombre, body.email, body.password)


@app.post("/api/auth/login")
async def login(body: Login) -> dict:
    return await auth.iniciar_sesion(body.email, body.password)


@app.post("/api/auth/refresh")
async def refresh(body: Refresh) -> dict:
    return await auth.refrescar(body.refreshToken)


UsuarioActual = Annotated[Usuario, Depends(usuario_actual)]


async def _respuesta_perfil(usuario: Usuario, p: dict) -> dict:
    ruc = p.get("ruc_empresa")
    empresa_db, cupo = await asyncio.gather(empresa_guardada(ruc) if ruc else asyncio.sleep(0), desbloqueos.cupo(p))
    return {
        "usuario": {"id": usuario.id, "email": usuario.email, "nombre": p.get("nombre_completo") or usuario.nombre},
        "ruc": ruc,
        "keywords": p.get("keywords") or [],
        "empresa": empresa_db,
        "desbloqueos": cupo,
    }


@app.get("/api/perfil")
async def ver_perfil(usuario: UsuarioActual) -> dict:
    return await _respuesta_perfil(usuario, await auth.perfil(usuario))


class CambiosPerfil(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    ruc: str | None = None
    keywords: list[str] | None = Field(default=None, max_length=100)


@app.put("/api/perfil")
async def actualizar_perfil(body: CambiosPerfil, usuario: UsuarioActual) -> dict:
    p = await auth.perfil(usuario)
    cambios: dict = {}
    if body.ruc is not None:
        ruc = re.sub(r"\D", "", body.ruc)
        if not ruc_valido(ruc):
            raise HTTPException(422, "El RUC debe tener 11 dígitos y empezar con 10, 15, 17 o 20.")
        if p.get("ruc_empresa") and p["ruc_empresa"] != ruc:
            # La cuenta queda ligada a su empresa: el cupo de desbloqueos y los análisis son de ese RUC.
            raise HTTPException(409, "Tu cuenta ya está registrada con otra empresa y no se puede cambiar.")
        if not await empresa_guardada(ruc):
            try:
                await obtener_empresa(ruc)  # la registra en proveedores (FK de perfiles.ruc_empresa)
            except EmpresaNoEncontrada as e:
                raise HTTPException(404, str(e)) from e
            if not await empresa_guardada(ruc):
                raise HTTPException(503, "No pudimos registrar la empresa. Inténtalo de nuevo.")
        cambios["ruc_empresa"] = ruc
        _cache_ciius.pop(ruc, None)
    if body.keywords is not None:
        cambios["keywords"] = limpiar_keywords(body.keywords)
    if body.nombre is not None:
        cambios["nombre_completo"] = re.sub(r"\s+", " ", body.nombre).strip()
    if cambios:
        cambios["updated_at"] = datetime.now(timezone.utc).isoformat()
        await get_db().update("perfiles", {"id": f"eq.{usuario.id}"}, cambios)
        if "keywords" in cambios:
            await suscripciones.sincronizar_keywords(usuario.id, cambios["keywords"])
        p = {**p, **cambios}
    return await _respuesta_perfil(usuario, p)


@app.post("/api/perfil/empresa/actualizar")
async def actualizar_empresa(usuario: UsuarioActual) -> dict:
    """Vuelve a consultar SUNAT (API MIGO) y RNP para el RUC de la cuenta y guarda la ficha."""
    p = await auth.perfil(usuario)
    ruc = p.get("ruc_empresa")
    if not ruc:
        raise HTTPException(409, "Aún no registras el RUC de tu empresa.")
    try:
        empresa_actual = await obtener_empresa(ruc)
    except EmpresaNoEncontrada as e:
        raise HTTPException(404, str(e)) from e
    _cache_ciius.pop(ruc, None)
    respuesta = await _respuesta_perfil(usuario, p)
    respuesta["avisos"] = empresa_actual.get("avisos") or []
    return respuesta


@app.get("/api/perfil/historial")
async def historial_empresa(usuario: UsuarioActual) -> dict:
    """Procesos del SEACE a los que postuló la empresa del perfil (tabla postulaciones)."""
    p = await auth.perfil(usuario)
    if not p.get("ruc_empresa"):
        return {"procesos": 0, "ganados": 0, "montoAdjudicado": 0, "porObjeto": {}, "ultimos": []}
    return await get_db().rpc("historial_empresa", {"p_ruc": p["ruc_empresa"]}) or {}


# ----------------------------------------------------------------------------- licitaciones

@app.get("/api/licitaciones")
async def listar_licitaciones(
    usuario: UsuarioActual,
    keywords: Annotated[list[str] | None, Query(max_length=MAX_KEYWORDS)] = None,
    q: Annotated[str | None, Query(max_length=120)] = None,
    departamento: str | None = None,
    objeto: str | None = None,
    fuente: str | None = None,
    keyword: Annotated[str | None, Query(max_length=MAX_LARGO_KEYWORD)] = None,
    solo_perfil: bool = True,
    orden: str = "afinidad",
    pagina: Annotated[int, Query(ge=1, le=1000)] = 1,
    por_pagina: Annotated[int, Query(ge=1, le=50)] = 10,
) -> dict:
    """
    Convocatorias abiertas para el perfil (CIIU del RUC + CUBSO + keywords), paginadas. Sin `keywords` se usan las
    guardadas en el perfil. Las URL de bases y ficha solo vienen en las licitaciones que el usuario desbloqueó.
    """
    p = await auth.perfil(usuario)
    if departamento and departamento.upper() not in licitaciones.DEPARTAMENTOS:
        raise HTTPException(422, "Departamento no válido.")
    if objeto and objeto not in licitaciones.OBJETOS:
        raise HTTPException(422, "Objeto de contratación no válido.")
    if orden not in licitaciones.ORDENES:
        raise HTTPException(422, "Orden no válido.")
    if fuente and fuente not in licitaciones.FUENTES:
        raise HTTPException(422, "Fuente no válida (OECE, PROD2 o PROD6).")

    kws = limpiar_keywords(keywords) if keywords is not None else (p.get("keywords") or [])
    ruc = p.get("ruc_empresa")
    perfil = licitaciones.Perfil(kws, await ciius_de_busqueda(ruc) if ruc else [], ruc=ruc)
    tiene_perfil = bool(perfil.ruc or perfil.keywords)
    kw_activa = (limpiar_keywords([keyword]) or [None])[0] if keyword else None

    res, cupo = await asyncio.gather(
        licitaciones.buscar_pagina(
            perfil if tiene_perfil else None, texto=q, departamento=departamento, objeto=objeto, keyword=kw_activa,
            fuente=fuente,
            solo_perfil=solo_perfil, orden=orden, limite=por_pagina, offset=(pagina - 1) * por_pagina,
        ),
        desbloqueos.cupo(p),
    )
    items = res["items"]
    links = await desbloqueos.enlaces_desbloqueados(usuario.id, [l["id"] for l in items])
    for l in items:
        l["desbloqueada"] = l["id"] in links
        l["fichaUrl"] = links.get(l["id"], {}).get("fichaUrl")
        l["basesUrl"] = links.get(l["id"], {}).get("basesUrl")
    return {
        **res,
        "items": items,
        "pagina": pagina,
        "porPagina": por_pagina,
        "totalPaginas": max(1, math.ceil(res["total"] / por_pagina)),
        "keywords": kws,
        "desbloqueos": cupo,
    }


@app.post("/api/licitaciones/{convocatoria_id}/desbloquear")
async def desbloquear(convocatoria_id: int, usuario: UsuarioActual) -> dict:
    return await desbloqueos.desbloquear(await auth.perfil(usuario), convocatoria_id)


@app.get("/api/licitaciones/{convocatoria_id}/desbloqueo")
async def ver_desbloqueo(convocatoria_id: int, usuario: UsuarioActual) -> dict:
    return await desbloqueos.detalle(await auth.perfil(usuario), convocatoria_id)


@app.post("/api/licitaciones/{convocatoria_id}/reanalizar")
async def reanalizar(convocatoria_id: int, usuario: UsuarioActual) -> dict:
    p = await auth.perfil(usuario)
    actual = await desbloqueos.detalle(p, convocatoria_id)
    if not actual["desbloqueada"]:
        raise HTTPException(404, "Primero desbloquea esta licitación.")
    if actual["estadoAnalisis"] in ("error", "sin_analisis"):
        await desbloqueos.iniciar_analisis(p, convocatoria_id, reintento=True)
    return await desbloqueos.detalle(p, convocatoria_id)


@app.get("/api/desbloqueos")
async def mis_desbloqueos(usuario: UsuarioActual) -> dict:
    p = await auth.perfil(usuario)
    return {"items": await desbloqueos.listar(p), **await desbloqueos.cupo(p)}


# ----------------------------------------------------------------------------- alertas

@app.get("/api/alertas/telegram")
async def estado_telegram(usuario: UsuarioActual) -> dict:
    """Si la cuenta tiene un chat de Telegram conectado para recibir alertas."""
    p = await auth.perfil(usuario)
    estado = await suscripciones.estado_de_perfil(p["id"])
    return {**estado, "botDisponible": bool(get_settings().telegram_bot_token)}


@app.post("/api/alertas/telegram")
async def crear_suscripcion_telegram(usuario: UsuarioActual) -> dict:
    """
    Enlace de un solo uso (vence en 24 h) para conectar Telegram a la cuenta. Usa el RUC, las keywords y los CIIU
    de la cuenta: desde el bot no se pueden consultar otras empresas.
    """
    p = await auth.perfil(usuario)
    ruc = p.get("ruc_empresa")
    if not ruc:
        raise HTTPException(409, "Registra primero el RUC de tu empresa.")
    username = await suscripciones.bot_username()
    if not username:
        raise HTTPException(503, "El bot de Telegram no está disponible en este momento.")
    empresa_db, ciius = await asyncio.gather(empresa_guardada(ruc), ciius_de_busqueda(ruc))
    try:
        token = await suscripciones.crear_pendiente(
            p["id"], ruc, (empresa_db or {}).get("razonSocial"), p.get("keywords") or [], ciius)
    except SupabaseError as e:
        raise HTTPException(503, "Las alertas por Telegram no están disponibles en este momento.") from e
    return {"botUsername": username, "token": token, **suscripciones.enlaces(username, token)}


@app.delete("/api/alertas/telegram")
async def desconectar_telegram(usuario: UsuarioActual) -> dict:
    p = await auth.perfil(usuario)
    await suscripciones.desvincular(p["id"])
    return await estado_telegram(usuario)
