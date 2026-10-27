"""
Licitaciones desde Supabase. El filtrado y la afinidad se calculan en la base (funciones SQL):

- buscar_licitaciones: solo convocatorias abiertas, match por CIIU (ítem CUBSO, familia CUBSO o descripción),
  por keywords y por texto libre; afinidad, motivos y paginación.
- sugerir_keywords: ítems CUBSO de los procesos del rubro del RUC y de los procesos a los que ya postuló.
"""

import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from .config import get_settings
from .supabase import get_db
from .texto import etiqueta_termino, tokens_significativos

LIMA = timezone(timedelta(hours=-5))
_MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
OBJETOS = ("Bienes", "Servicios", "Obras", "Consultoría", "Consultoría de Obra")
ORDENES = ("afinidad", "cierre", "recientes", "monto")
FUENTES = ("OECE", "PROD2", "PROD6")
DEPARTAMENTOS = [
    "AMAZONAS", "ANCASH", "APURIMAC", "AREQUIPA", "AYACUCHO", "CAJAMARCA", "CALLAO", "CUSCO", "HUANCAVELICA",
    "HUANUCO", "ICA", "JUNIN", "LA LIBERTAD", "LAMBAYEQUE", "LIMA", "LORETO", "MADRE DE DIOS", "MOQUEGUA",
    "PASCO", "PIURA", "PUNO", "SAN MARTIN", "TACNA", "TUMBES", "UCAYALI",
]


def ahora_lima() -> datetime:
    return datetime.now(LIMA)


def _fecha(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        d = datetime.fromisoformat(s)
    except ValueError:
        return None
    return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).astimezone(LIMA)


@dataclass
class Perfil:
    keywords: list[str]
    ciius: list[str] = field(default_factory=list)
    ruc: str | None = None


def a_licitacion(f: dict, ahora: datetime | None = None) -> dict:
    ahora = ahora or ahora_lima()
    pub, lim = _fecha(f.get("fecha_publicacion")), _fecha(f.get("fecha_limite"))
    dep = f.get("departamento") or "NO ESPECIFICADO"
    return {
        "id": f["convocatoria_id"],
        "codigo": f.get("licitacion") or f.get("nomenclatura") or str(f["convocatoria_id"]),
        "nomenclatura": f.get("nomenclatura"),
        "esNueva": bool(pub and pub >= ahora - timedelta(hours=48)),
        "ubicacion": dep.title(),
        "departamento": dep,
        "publicacion": f"{pub.day} {_MESES[pub.month - 1]} {pub.year}" if pub else "—",
        "fechaPublicacion": pub.isoformat() if pub else None,
        "fechaLimite": lim.isoformat() if lim else None,
        "objeto": f.get("objeto") or "—",
        "etapa": "Convocado",
        "vigente": True,
        "titulo": (f.get("descripcion") or "").strip(),
        "entidad": f.get("entidad") or "",
        "valorReferencial": float(f.get("monto_referencial") or 0),
        "moneda": f.get("moneda") or "PEN",
        "matchPorcentaje": int(f.get("puntaje") or 0),
        "motivos": f.get("motivos") or [],
        "keywords": f.get("keywords") or [],
        "ciiu": f.get("ciiu"),
        "ciiuTitulo": f.get("ciiu_titulo"),
        "fuente": f.get("fuente"),
        "tipoProcedimiento": f.get("tipo_procedimiento"),
    }


async def buscar_pagina(perfil: Perfil | None = None, *, texto: str | None = None, departamento: str | None = None,
                        objeto: str | None = None, keyword: str | None = None, fuente: str | None = None,
                        solo_perfil: bool = True,
                        orden: str = "afinidad", desde: datetime | None = None, limite: int = 10,
                        offset: int = 0) -> dict:
    """Una página de convocatorias abiertas + totales del conjunto filtrado."""
    filas = await get_db().rpc("buscar_licitaciones", {
        "p_ruc": perfil.ruc if perfil else None,
        "p_ciius": perfil.ciius if perfil and perfil.ciius else None,
        "p_keywords": perfil.keywords if perfil and perfil.keywords else None,
        "p_q": (texto or "").strip() or None,
        "p_departamento": departamento or None,
        "p_objeto": objeto or None,
        "p_keyword": keyword or None,
        "p_modo": "perfil" if perfil and solo_perfil else "todas",
        "p_orden": orden if orden in ORDENES else "afinidad",
        "p_desde": desde.isoformat() if desde else None,
        "p_limite": limite,
        "p_offset": offset,
        "p_fuente": fuente if fuente in FUENTES else None,
    }) or []
    ahora = ahora_lima()
    primera = filas[0] if filas else {}
    return {
        "items": [a_licitacion(f, ahora) for f in filas],
        "total": int(primera.get("total") or 0),
        "montoTotal": float(primera.get("monto_total") or 0),
        "altaAfinidad": int(primera.get("total_alta_afinidad") or 0),
    }


async def buscar(perfil: Perfil | None = None, texto: str | None = None, desde: datetime | None = None,
                 limite: int = 50) -> list[dict]:
    """Lista simple (bot de Telegram), con el enlace a la ficha SEACE."""
    pagina = await buscar_pagina(perfil, texto=texto, desde=desde, limite=limite)
    return await con_enlaces(pagina["items"])


async def con_enlaces(lics: list[dict]) -> list[dict]:
    """Agrega fichaUrl (ficha SEACE) y basesUrl (bases administrativas) a cada licitación."""
    if not lics:
        return lics
    ids = ",".join(str(l["id"]) for l in lics)
    filas = await get_db().select("convocatorias", {"select": "id,ver_proceso_url,url_bases_pdf", "id": f"in.({ids})"})
    enlaces = {f["id"]: f for f in filas}
    for l in lics:
        f = enlaces.get(l["id"], {})
        l["fichaUrl"] = f.get("ver_proceso_url")
        l["basesUrl"] = f.get("url_bases_pdf")
    return lics


async def contar_keyword(keyword: str) -> int:
    """Convocatorias abiertas que calzan con una keyword (para mostrarlo al agregarla a mano)."""
    filas = await get_db().rpc("buscar_licitaciones", {
        "p_keywords": [keyword], "p_keyword": keyword, "p_modo": "todas", "p_limite": 1,
    }) or []
    return int(filas[0]["total"]) if filas else 0


_cache_catalogo: dict[str, tuple[float, list[str]]] = {}


async def _catalogo_ciiu(ciius: list[str]) -> list[str]:
    """Nombres CUBSO del catálogo para esos CIIU (respaldo cuando el rubro casi no tiene procesos)."""
    clave = ",".join(sorted(ciius))
    hit = _cache_catalogo.get(clave)
    if hit and time.monotonic() - hit[0] < get_settings().cache_ttl_sec:
        return hit[1]
    filas = await get_db().select("cubso_ciiu_match", {
        "select": "descripcion",
        "or": f"(ciiu_fab.in.({clave}),ciiu_com.in.({clave}))",
        "order": "cubso",
    }, limit=3000)
    conteo: dict[str, int] = {}
    for f in filas:
        n = etiqueta_termino(f.get("descripcion"))
        if len(tokens_significativos(n)) >= 2:
            conteo[n] = conteo.get(n, 0) + 1
    nombres = sorted(conteo, key=lambda n: (-conteo[n], n))
    _cache_catalogo[clave] = (time.monotonic(), nombres)
    return nombres


def _peso_termino(t: dict, tiene_historial: bool) -> float:
    """
    Qué tan buena es una keyword sugerida. Pesan las licitaciones abiertas hoy, multiplicadas por:
    - CIIU específico x3 frente a uno genérico ('venta al por mayor no especializada', 'otros tipos de maquinaria'),
      que calzan con casi cualquier ítem;
    - rubro del historial x2: el ítem es del mismo segmento CUBSO/UNSPSC (equipo médico, construcción...) que los
      procesos a los que la empresa ya postuló;
    - x0.25 si viene de un CIIU genérico y la empresa tiene historial en otros rubros (máquina tejedora para una
      empresa de equipos médicos);
    - actividad principal x1, secundaria x0.8, inferida x0.5.
    """
    orden = t["ciiuOrden"]
    peso_ciiu = 1.0 if orden is None or orden == 0 else 0.5 if orden >= 100 else 0.8
    peso = t["vigentes"] * (1 if t["ciiuGenerico"] else 3) * (2 if t["rubroHistorial"] else 1) * peso_ciiu
    if t["ciiuGenerico"] and tiene_historial and not t["rubroHistorial"]:
        peso *= 0.25
    return peso


async def terminos_mas_licitados(ciius: list[str], limite: int = 10, ruc: str | None = None) -> list[dict]:
    """
    Keywords sugeridas para el RUC: nombres de ítems CUBSO (sin medidas) de las convocatorias de su rubro CIIU y de
    los procesos a los que ya postuló. Primero las que hoy tienen licitaciones abiertas, ordenadas por
    `_peso_termino`; después las del historial sin abiertas (sirven para alertas). Se evitan casi duplicados
    ('LADRILLO' y 'LADRILLO KING KONG'). Si el rubro tiene pocos procesos se completa con el catálogo.
    """
    if not ciius and not ruc:
        return []
    filas = await get_db().rpc("sugerir_keywords", {
        "p_ruc": ruc, "p_ciius": ciius or None, "p_limite": max(120, limite * 10),
    }) or []

    por_termino: dict[str, dict] = {}
    for f in filas:
        termino = etiqueta_termino(f.get("nombre"))
        if len(tokens_significativos(termino)) < 1 or len(termino) < 4:
            continue
        t = por_termino.setdefault(termino, {
            "termino": termino, "licitaciones": 0, "vigentes": 0, "historial": False, "rubroHistorial": False,
            "ciiu": f.get("ciiu"), "ciiuOrden": f.get("ciiu_orden"), "ciiuGenerico": bool(f.get("ciiu_generico")),
        })
        # Un mismo término puede venir de varios códigos CUBSO (variantes): se toma el mayor, no la suma.
        t["licitaciones"] = max(t["licitaciones"], int(f.get("licitaciones") or 0))
        t["vigentes"] = max(t["vigentes"], int(f.get("abiertas") or 0))
        t["historial"] = t["historial"] or bool(f.get("historial"))
        t["rubroHistorial"] = t["rubroHistorial"] or bool(f.get("rubro_historial")) or t["historial"]

    tiene_historial = any(t["historial"] for t in por_termino.values())
    ranking = sorted(por_termino.values(), key=lambda t: (
        t["vigentes"] == 0,
        -_peso_termino(t, tiene_historial),
        not t["historial"],
        -t["licitaciones"],
        t["termino"],
    ))
    elegidos: list[dict] = []
    toks_elegidos: list[frozenset[str]] = []
    for t in ranking:
        # Sin abiertas solo entran las del historial de la empresa (útiles para alertas), no el resto del rubro.
        if t["vigentes"] == 0 and not t["historial"]:
            continue
        toks = tokens_significativos(t["termino"])
        if any(toks <= e or e <= toks for e in toks_elegidos):
            continue
        elegidos.append(t)
        toks_elegidos.append(toks)
        if len(elegidos) >= limite:
            break

    if len(elegidos) < limite and ciius:
        for n in await _catalogo_ciiu(ciius):
            if len(elegidos) >= limite:
                break
            toks = tokens_significativos(n)
            if any(toks <= e or e <= toks for e in toks_elegidos):
                continue
            elegidos.append({"termino": n, "licitaciones": 0, "vigentes": 0, "historial": False,
                             "rubroHistorial": False, "ciiu": None})
            toks_elegidos.append(toks)
    for t in elegidos:
        t.pop("ciiuOrden", None)
        t.pop("ciiuGenerico", None)
    return elegidos


async def estadisticas() -> dict:
    return await get_db().rpc("estadisticas_lici") or {}
