"""
Desbloqueo de licitaciones: cada cuenta puede desbloquear `perfiles.limite_desbloqueos` (5) licitaciones abiertas.

Al desbloquear se reserva el cupo en la base (función desbloquear_licitacion, atómica) y se lanza en segundo plano
el flujo n8n "Analizador ISO Licitaciones": con la nomenclatura y el RUC del perfil descarga las bases, detecta
las ISO que piden y genera la recomendación para la empresa. El frontend consulta el estado hasta que termina.
Volver a desbloquear la misma licitación no gasta otro cupo, y si el análisis falla se puede reintentar gratis.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import httpx

from .config import get_settings
from .supabase import SupabaseError, get_db

log = logging.getLogger(__name__)

_DOCS_BASES = ("bases_administrativas", "bases_integradas", "resumen_ejecutivo")
_tareas: set[asyncio.Task] = set()


class DesbloqueoError(Exception):
    def __init__(self, status: int, mensaje: str):
        super().__init__(mensaje)
        self.status = status
        self.mensaje = mensaje


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _dt(s: str | None) -> datetime | None:
    try:
        d = datetime.fromisoformat(str(s))
    except (TypeError, ValueError):
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _iso_z(d: datetime) -> str:
    """Formato sin '+' para usarlo dentro de un filtro or=(...) de PostgREST."""
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _vencido(d: dict) -> bool:
    """Un análisis 'procesando' que superó el timeout (p. ej. se reinició el servidor) se considera fallido."""
    act = _dt(d.get("updated_at"))
    return act is None or _ahora() - act > timedelta(seconds=get_settings().n8n_timeout_sec + 60)


async def cupo(perfil: dict) -> dict:
    usados = await get_db().count("desbloqueos", {"perfil_id": f"eq.{perfil['id']}"})
    limite = int(perfil.get("limite_desbloqueos") or 0)
    return {"usados": usados, "limite": limite, "disponibles": max(0, limite - usados)}


async def enlaces_desbloqueados(perfil_id: str, convocatoria_ids: list[int]) -> dict[int, dict]:
    """{convocatoria_id: {fichaUrl, basesUrl}} de las licitaciones de la lista que el usuario ya desbloqueó."""
    if not convocatoria_ids:
        return {}
    filas = await get_db().select("desbloqueos", {
        "select": "convocatoria_id,convocatorias(ver_proceso_url,url_bases_pdf)", "perfil_id": f"eq.{perfil_id}",
        "convocatoria_id": f"in.({','.join(str(i) for i in convocatoria_ids)})",
    })
    return {f["convocatoria_id"]: {"fichaUrl": (f.get("convocatorias") or {}).get("ver_proceso_url"),
                                   "basesUrl": (f.get("convocatorias") or {}).get("url_bases_pdf")}
            for f in filas}


async def desbloquear(perfil: dict, convocatoria_id: int) -> dict:
    if not perfil.get("ruc_empresa"):
        raise DesbloqueoError(409, "Registra el RUC de tu empresa antes de desbloquear licitaciones.")
    try:
        filas = await get_db().rpc("desbloquear_licitacion",
                                   {"p_perfil": perfil["id"], "p_convocatoria": convocatoria_id})
    except SupabaseError as e:
        if "LIMITE_DESBLOQUEOS" in e.mensaje:
            limite = int(perfil.get("limite_desbloqueos") or 0)
            raise DesbloqueoError(403, f"Ya usaste tus {limite} desbloqueos disponibles.") from e
        if "LICITACION_NO_DISPONIBLE" in e.mensaje:
            raise DesbloqueoError(409, "Esta licitación ya no está abierta, no se puede desbloquear.") from e
        if "PERFIL_NO_ENCONTRADO" in e.mensaje:
            raise DesbloqueoError(404, "No encontramos tu perfil.") from e
        raise
    if filas and filas[0].get("nuevo"):
        log.info("Perfil %s desbloqueó la convocatoria %s (%s/%s)", perfil["id"], convocatoria_id,
                 filas[0].get("usados"), filas[0].get("limite"))
    await iniciar_analisis(perfil, convocatoria_id)
    return await detalle(perfil, convocatoria_id)


async def _analisis_guardado(ruc: str | None, convocatoria_id: int) -> dict | None:
    """Recomendación que n8n ya guardó para esta empresa y licitación (analisis_empresa_licitacion)."""
    if not ruc:
        return None
    filas = await get_db().select("analisis_empresa_licitacion", {
        "select": "recomendacion,encaje,brechas,iso_recomendadas,texto,updated_at",
        "ruc": f"eq.{ruc}", "convocatoria_id": f"eq.{convocatoria_id}",
    }, limit=1)
    return filas[0] if filas else None


async def iniciar_analisis(perfil: dict, convocatoria_id: int, reintento: bool = False) -> None:
    """
    Pasa el desbloqueo a 'procesando' (solo si nadie más lo hizo) y llama a n8n en segundo plano. Si la misma
    empresa ya tiene análisis de esta licitación, se reutiliza y no se llama a n8n (no se gasta Gemini); un
    reintento explícito sí vuelve a analizar.
    """
    s = get_settings()
    db = get_db()
    filtros = {"perfil_id": f"eq.{perfil['id']}", "convocatoria_id": f"eq.{convocatoria_id}"}
    if not reintento and await _analisis_guardado(perfil.get("ruc_empresa"), convocatoria_id):
        await db.update("desbloqueos", {**filtros, "estado": "eq.pendiente"},
                        {"estado": "listo", "error": None, "updated_at": _ahora().isoformat()})
        return
    if not s.n8n_webhook_url:
        await db.update("desbloqueos", {**filtros, "estado": "eq.pendiente"},
                        {"estado": "sin_analisis", "error": "El análisis con IA aún no está configurado.",
                         "updated_at": _ahora().isoformat()})
        return

    limite_procesando = _iso_z(_ahora() - timedelta(seconds=s.n8n_timeout_sec + 60))
    estados = "pendiente,error,sin_analisis" if reintento else "pendiente"
    tomados = await db.update(
        "desbloqueos",
        {**filtros, "or": f"(estado.in.({estados}),and(estado.eq.procesando,updated_at.lt.{limite_procesando}))"},
        {"estado": "procesando", "error": None, "updated_at": _ahora().isoformat()},
        returning=True,
    )
    if not tomados:
        return  # ya está listo o lo está procesando otra petición
    d = tomados[0]
    await db.update("desbloqueos", {"id": f"eq.{d['id']}"}, {"intentos": int(d.get("intentos") or 0) + 1})

    conv = await db.select("convocatorias", {"select": "nomenclatura_norm,licitacion", "id": f"eq.{convocatoria_id}"},
                           limit=1)
    nomenclatura = (conv[0].get("nomenclatura_norm") or conv[0].get("licitacion")) if conv else None
    tarea = asyncio.create_task(_analizar(d["id"], nomenclatura, d.get("ruc") or perfil.get("ruc_empresa"),
                                          perfil["id"]))
    _tareas.add(tarea)
    tarea.add_done_callback(_tareas.discard)


async def _analizar(desbloqueo_id: int, nomenclatura: str | None, ruc: str | None, perfil_id: str) -> None:
    s = get_settings()
    estado, resultado, error = "error", None, None
    try:
        if not nomenclatura:
            raise ValueError("La convocatoria no tiene nomenclatura")
        async with httpx.AsyncClient(timeout=s.n8n_timeout_sec) as http:
            resp = await http.post(s.n8n_webhook_url, json={"licitacion": nomenclatura, "ruc": ruc,
                                                             "perfil_id": perfil_id})
        try:
            resultado = resp.json()
        except ValueError:
            resultado = None
        if isinstance(resultado, list):
            resultado = resultado[0] if resultado else None
        status = (resultado or {}).get("status") if isinstance(resultado, dict) else None
        if resp.status_code < 400 and status in ("processed", "cached"):
            estado = "listo"
        elif status in ("too_large", "not_supported", "not_found"):
            estado = "sin_analisis"
            error = (resultado or {}).get("mensaje") or "No se pudo analizar el documento de bases."
        else:
            error = f"El análisis respondió con un error (HTTP {resp.status_code})."
            log.warning("n8n HTTP %s para %s: %s", resp.status_code, nomenclatura, resp.text[:300])
    except httpx.TimeoutException:
        error = "El análisis tardó demasiado. Puedes reintentarlo."
    except Exception as e:  # noqa: BLE001 - cualquier fallo queda registrado en el desbloqueo
        log.exception("Fallo analizando %s", nomenclatura)
        error = f"No se pudo completar el análisis ({type(e).__name__})."
    try:
        await get_db().update("desbloqueos", {"id": f"eq.{desbloqueo_id}"}, {
            "estado": estado, "resultado": resultado if isinstance(resultado, dict) else None,
            "error": error, "updated_at": _ahora().isoformat(),
        })
    except SupabaseError:
        log.exception("No se pudo guardar el resultado del desbloqueo %s", desbloqueo_id)


def _requisitos_iso(texto: str | None) -> dict | None:
    """'ESTADO: Sí\\nNORMAS SOLICITADAS: ISO 9001\\nMODALIDAD: ...\\nRESUMEN: ...' -> dict."""
    if not texto or not texto.strip().upper().startswith("ESTADO:"):
        return None
    campos: dict[str, str] = {}
    clave = None
    for linea in texto.splitlines():
        cab, sep, valor = linea.partition(":")
        if sep and cab.strip().upper() in ("ESTADO", "NORMAS SOLICITADAS", "MODALIDAD", "RESUMEN", "ARCHIVO ANALIZADO"):
            clave = cab.strip().upper()
            campos[clave] = valor.strip()
        elif clave:
            campos[clave] += "\n" + linea
    normas = [n.strip() for n in campos.get("NORMAS SOLICITADAS", "").split(",") if n.strip() and n.strip() != "Ninguna"]
    return {"estado": campos.get("ESTADO"), "normas": normas, "modalidad": campos.get("MODALIDAD"),
            "resumen": campos.get("RESUMEN")}


def _lista(v) -> list:
    if isinstance(v, list):
        return v
    return [v] if v else []


def _analisis(resultado: dict | None, guardado: dict | None, requiere_iso: str | None) -> dict | None:
    """Unifica la respuesta de n8n (o lo que guardó en analisis_empresa_licitacion) en un solo formato."""
    rec = (resultado or {}).get("recomendacion") if resultado else None
    if isinstance(rec, dict):
        return {
            "veredicto": rec.get("recomendacion"),
            "encaje": rec.get("encaje_actividad"),
            "brechas": [str(b) for b in _lista(rec.get("brechas"))],
            "resumen": rec.get("resumen"),
            "isoRecomendadas": [r for r in _lista(rec.get("iso_recomendadas")) if isinstance(r, dict)],
            "pack": rec.get("pack_disponible"),
            "mensajeComercial": rec.get("mensaje_comercial"),
            "requisitosIso": _requisitos_iso(resultado.get("requiere_iso") or requiere_iso),
        }
    if guardado:
        resumen = next((l.partition(":")[2].strip() for l in (guardado.get("texto") or "").splitlines()
                        if l.upper().startswith("RESUMEN:")), None)
        return {
            "veredicto": guardado.get("recomendacion"),
            "encaje": guardado.get("encaje"),
            "brechas": [str(b) for b in _lista(guardado.get("brechas"))],
            "resumen": resumen,
            "isoRecomendadas": [r for r in _lista(guardado.get("iso_recomendadas")) if isinstance(r, dict)],
            "pack": None,
            "mensajeComercial": None,
            "requisitosIso": _requisitos_iso(requiere_iso),
        }
    if resultado and resultado.get("requiere_iso"):
        return {"veredicto": None, "encaje": None, "brechas": [], "resumen": None, "isoRecomendadas": [],
                "pack": None, "mensajeComercial": None, "requisitosIso": _requisitos_iso(resultado["requiere_iso"])}
    return None


async def detalle(perfil: dict, convocatoria_id: int) -> dict:
    db = get_db()
    filas = await db.select("desbloqueos", {
        "select": "*", "perfil_id": f"eq.{perfil['id']}", "convocatoria_id": f"eq.{convocatoria_id}",
    }, limit=1)
    if not filas:
        return {"desbloqueada": False, "convocatoriaId": convocatoria_id, **await cupo(perfil)}
    d = filas[0]

    conv_q = db.select("convocatorias", {
        "select": "id,licitacion,nomenclatura_norm,ver_proceso_url,url_bases_pdf,requiere_iso",
        "id": f"eq.{convocatoria_id}",
    }, limit=1)
    docs_q = db.select("documentos_proceso", {
        "select": "documento,nombre_archivo,url_descarga,categoria,fecha_publicacion",
        "convocatoria_id": f"eq.{convocatoria_id}", "categoria": f"in.({','.join(_DOCS_BASES)})",
        "order": "fecha_publicacion.desc.nullslast",
    }, limit=10)
    ana_q = _analisis_guardado(d.get("ruc") or perfil.get("ruc_empresa"), convocatoria_id)
    conv, docs, guardado, cupo_actual = await asyncio.gather(conv_q, docs_q, ana_q, cupo(perfil))
    c = conv[0] if conv else {}

    estado, error = d["estado"], d.get("error")
    if estado == "procesando" and _vencido(d):
        estado, error = "error", "El análisis no terminó. Puedes reintentarlo."
    if estado in ("error", "sin_analisis", "pendiente") and guardado and not d.get("resultado"):
        # Ya hay un análisis de esta empresa para esta licitación (o n8n lo guardó aunque la llamada se perdió).
        estado, error = "listo", None

    documentos = [{"nombre": x.get("documento") or x.get("nombre_archivo"), "archivo": x.get("nombre_archivo"),
                   "url": x.get("url_descarga"), "categoria": x.get("categoria")}
                  for x in docs if x.get("url_descarga")]
    return {
        "desbloqueada": True,
        "convocatoriaId": convocatoria_id,
        "codigo": c.get("licitacion") or c.get("nomenclatura_norm"),
        "basesUrl": c.get("url_bases_pdf"),
        "fichaUrl": c.get("ver_proceso_url"),
        "documentos": documentos,
        "estadoAnalisis": estado,
        "error": error,
        "analisisDisponible": bool(get_settings().n8n_webhook_url),
        "analisis": _analisis(d.get("resultado"), guardado, c.get("requiere_iso")) if estado == "listo" else None,
        "desbloqueadaEl": d["created_at"],
        **cupo_actual,
    }


async def listar(perfil: dict) -> list[dict]:
    """Historial de licitaciones desbloqueadas por la cuenta, con su veredicto de IA y si siguen abiertas."""
    db = get_db()
    filas = await db.select("desbloqueos", {
        "select": "convocatoria_id,estado,created_at,veredicto:resultado->recomendacion->>recomendacion,"
                  "convocatorias(fuente,licitacion,objeto_descripcion,entidad_convocante,objeto_contratacion,departamento,"
                  "fecha_publicacion,fecha_limite,monto_referencial,moneda,abierta,url_bases_pdf,ver_proceso_url)",
        "perfil_id": f"eq.{perfil['id']}", "order": "created_at.desc",
    })
    # Si la respuesta de n8n no quedó guardada en el desbloqueo, el veredicto se toma de lo que n8n guardó por RUC.
    sin_veredicto = [f["convocatoria_id"] for f in filas if not f.get("veredicto")]
    guardados: dict[int, str] = {}
    if sin_veredicto and perfil.get("ruc_empresa"):
        for a in await db.select("analisis_empresa_licitacion", {
            "select": "convocatoria_id,recomendacion", "ruc": f"eq.{perfil['ruc_empresa']}",
            "convocatoria_id": f"in.({','.join(str(i) for i in sin_veredicto)})",
        }):
            guardados[a["convocatoria_id"]] = a.get("recomendacion")

    ahora = _ahora()
    items = []
    for f in filas:
        c = f.get("convocatorias") or {}
        limite = _dt(c.get("fecha_limite"))
        items.append({
            "convocatoriaId": f["convocatoria_id"],
            "estadoAnalisis": f["estado"],
            "veredicto": f.get("veredicto") or guardados.get(f["convocatoria_id"]),
            "desbloqueadaEl": f["created_at"],
            "codigo": c.get("licitacion"),
            "fuente": c.get("fuente"),
            "titulo": (c.get("objeto_descripcion") or "").strip(),
            "entidad": c.get("entidad_convocante") or "",
            "objeto": c.get("objeto_contratacion") or "—",
            "departamento": c.get("departamento") or "NO ESPECIFICADO",
            "fechaPublicacion": c.get("fecha_publicacion"),
            "fechaLimite": c.get("fecha_limite"),
            "valorReferencial": float(c.get("monto_referencial") or 0),
            "moneda": c.get("moneda") or "PEN",
            "abierta": bool(c.get("abierta")) and (limite is None or limite > ahora),
            "basesUrl": c.get("url_bases_pdf"),
            "fichaUrl": c.get("ver_proceso_url"),
        })
    return items
