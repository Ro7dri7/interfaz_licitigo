import asyncio
import math
import os
import re
import unicodedata
from datetime import date, datetime

import httpx
from dotenv import load_dotenv
from collections import Counter, defaultdict

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from database import get_db
from models import Convocatoria

load_dotenv()

app = FastAPI(title="Lici API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LicitacionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    nomenclatura_norm: str
    nomenclatura: str | None = None
    entidad: str | None
    objeto: str | None
    descripcion: str | None = None
    ficha_url: str | None = None
    estado: str | None
    fecha_publicacion: datetime | None
    monto: str | None
    etapa_seace: str | None
    fecha_integracion: datetime | None
    fecha_presentacion: datetime | None
    departamento: str = "Sin departamento"


class PaginaLicitaciones(BaseModel):
    items: list[LicitacionOut]
    total: int
    page: int
    pages: int


class AnalizarIn(BaseModel):
    licitacion: str
    ruc: str


class AlertaTelegramIn(BaseModel):
    ruc: str | None = None
    razonSocial: str | None = None
    keywords: list[str] = []
    ciius: list[str] = []


@app.get("/")
def raiz() -> dict[str, str | bool]:
    return {"ok": True, "docs": "/docs"}


@app.get("/api/estadisticas")
def estadisticas(db: Session = Depends(get_db)) -> dict[str, object]:
    row = db.execute(
        text(
            """
            select
              count(*) as total,
              count(*) filter (where estado = 'Vigente') as vigentes,
              count(*) filter (
                where estado = 'Vigente'
                  and fecha_publicacion >= now() - interval '24 hours'
              ) as nuevas_24h,
              coalesce(sum(
                case
                  when estado = 'Vigente' then nullif(
                    regexp_replace(replace(coalesce(monto, ''), ',', ''), '[^0-9.]', '', 'g'),
                    ''
                  )::numeric
                end
              ), 0) as monto_vigente,
              max(fecha_publicacion) as ultima_actualizacion
            from convocatorias
            """
        )
    ).mappings().one()
    ultima = row["ultima_actualizacion"]
    return {
        "totalConvocatorias": row["total"],
        "vigentes": row["vigentes"],
        "nuevas24h": row["nuevas_24h"],
        "montoVigente": float(row["monto_vigente"] or 0),
        "ultimaActualizacion": ultima.isoformat() if ultima else None,
    }


_RE_ACTIVIDAD = re.compile(
    r"^\s*(Principal|Secundaria\s*\d*)\s*-\s*(\d{4})\s*-\s*(.+?)\s*$",
    re.IGNORECASE,
)


def _ciius_migo(lineas: list[object]) -> list[dict[str, str]]:
    ciius: list[dict[str, str]] = []
    for linea in lineas:
        match = _RE_ACTIVIDAD.match(str(linea))
        if match and all(item["codigo"] != match.group(2) for item in ciius):
            ciius.append(
                {
                    "codigo": match.group(2),
                    "descripcion": match.group(3).strip(),
                    "tipo": match.group(1).strip().capitalize(),
                    "origen": "oficial",
                }
            )
    return ciius


_TIPOS_RNP = (("1", "Bienes"), ("2", "Servicios"), ("3", "Consultoría de Obras"), ("4", "Obras"))


def _tipos_rnp(codigo: object) -> list[str]:
    texto = str(codigo or "")
    return [nombre for numero, nombre in _TIPOS_RNP if numero in texto]


def _ficha(ruc: str, migo: dict[str, object], rnp: dict[str, object] | None) -> dict[str, object]:
    estado = str(migo.get("estado_del_contribuyente") or "").upper() or None
    condicion = str(migo.get("condicion_de_domicilio") or "").upper() or None
    proveedor = rnp or {}
    tipos = _tipos_rnp(proveedor.get("lscIdTipReg") or proveedor.get("lscIdTipRegVig"))
    vigente = bool(proveedor.get("esHabilitado"))
    apto = bool(proveedor.get("esAptoContratar"))
    ubicacion = [str(migo[key]) for key in ("departamento", "provincia", "distrito") if migo.get(key)]
    comercial = migo.get("nombre_comercial")
    ciius = _ciius_migo(list(migo.get("actividades_economicas") or []))
    capacidad = proveedor.get("cmcTexto") or "No registra"
    return {
        "ruc": ruc,
        "razonSocial": migo.get("nombre_o_razon_social") or "",
        "estado_sunat": estado,
        "condicion_sunat": condicion,
        "sunatOk": estado == "ACTIVO" and condicion == "HABIDO",
        "rnp_vigente": vigente,
        "rnp_apto": apto,
        "rnp_tipos": tipos,
        "nombreComercial": comercial if comercial not in (None, "", "-") else None,
        "estadoSunat": estado,
        "condicionSunat": " / ".join(part for part in (condicion, estado) if part) or "SIN DATOS SUNAT",
        "rnpVigente": vigente,
        "aptoContratar": apto,
        "tiposRnp": tipos,
        "especialidadesRnp": [],
        "capacidadMaxima": capacidad,
        "rubro": ciius[0]["descripcion"] if ciius else "Sin actividad registrada",
        "ciius": ciius,
        "ubicacion": " · ".join(ubicacion) if ubicacion else "No registra",
        "direccion": migo.get("direccion"),
        "avisos": [],
    }


async def _consultar_migo(client: httpx.AsyncClient, ruc: str, token: str) -> dict[str, object]:
    response = await client.get(
        f"https://api.migo.pe/api/v2/ruc/{ruc}/sunat",
        headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
    )
    if response.status_code != 200:
        raise HTTPException(status_code=404, detail="RUC inválido o no encontrado en SUNAT")
    payload = response.json()
    if not isinstance(payload, dict) or payload.get("success") is False:
        raise HTTPException(status_code=404, detail="RUC inválido o no encontrado en SUNAT")
    return payload


async def _consultar_rnp(client: httpx.AsyncClient, ruc: str) -> dict[str, object] | None:
    try:
        response = await client.get(
            f"https://eap.oece.gob.pe/perfilprov-bus/1.0/ficha/{ruc}",
            headers={"Accept": "application/json", "Origin": "https://apps.oece.gob.pe"},
        )
    except httpx.HTTPError:
        return None
    if response.status_code != 200:
        return None
    try:
        body = response.json()
    except ValueError:
        return None
    proveedor = body.get("proveedorT01") if isinstance(body, dict) else None
    if not isinstance(proveedor, dict) or not proveedor.get("numRuc"):
        return None
    return proveedor


@app.get("/api/empresas/{ruc}")
async def empresa(ruc: str) -> dict[str, object]:
    token = os.getenv("MIGO_API_TOKEN", "").strip()
    if not token:
        raise HTTPException(status_code=503, detail="MIGO_API_TOKEN no está configurada")

    digits = "".join(ch for ch in ruc if ch.isdigit())
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            migo, rnp = await asyncio.gather(_consultar_migo(client, digits, token), _consultar_rnp(client, digits))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=404, detail="RUC inválido o no encontrado en SUNAT") from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="RUC inválido o no encontrado en SUNAT") from exc

    return _ficha(digits, migo, rnp)


_RE_MEDIDA = re.compile(r"\([^)]*\)")
_STOP = {"de", "del", "la", "las", "el", "los", "y", "e", "o", "u", "en", "para", "con", "a", "al", "por", "x"}


def _etiqueta_termino(descripcion: str | None) -> str:
    base = _RE_MEDIDA.sub(" ", (descripcion or "").split(" - ", 1)[0])
    palabras: list[str] = []
    for palabra in base.split():
        if any(ch.isdigit() for ch in palabra):
            break
        palabras.append(palabra)
    while palabras and palabras[-1].strip(".,;:-").lower() in _STOP:
        palabras.pop()
    return " ".join(palabras).strip(" .,;:-").upper()


@app.get("/api/terminos")
def terminos(
    ciius: str,
    limite: int = Query(default=10, ge=1, le=30),
    db: Session = Depends(get_db),
) -> list[dict[str, object]]:
    codigos = [c for c in ciius.replace(" ", "").split(",") if re.fullmatch(r"\d{4}", c)]
    if not codigos:
        raise HTTPException(status_code=422, detail="Indica al menos un CIIU de 4 dígitos.")

    catalogo = db.execute(
        text(
            """
            select cubso, descripcion
            from cubso_ciiu_match
            where ciiu_fab = any(:ciius) or ciiu_com = any(:ciius)
            """
        ),
        {"ciius": codigos},
    ).mappings().all()

    nombre_por_cubso: dict[str, str] = {}
    for fila in catalogo:
        nombre = _etiqueta_termino(fila["descripcion"])
        if len(nombre) >= 3:
            nombre_por_cubso[str(fila["cubso"])] = nombre

    conteo: dict[str, set[str]] = defaultdict(set)
    vigentes_por_termino: dict[str, set[str]] = defaultdict(set)
    if nombre_por_cubso:
        procesos = db.execute(
            text(
                """
                select i.codigo_cubso, i.nomenclatura_norm, c.estado
                from items_proceso i
                join convocatorias c on c.nomenclatura_norm = i.nomenclatura_norm
                where i.codigo_cubso = any(:cubsos)
                """
            ),
            {"cubsos": list(nombre_por_cubso)},
        ).mappings().all()
        for fila in procesos:
            termino = nombre_por_cubso.get(str(fila["codigo_cubso"]))
            if not termino:
                continue
            proceso = str(fila["nomenclatura_norm"])
            conteo[termino].add(proceso)
            if fila["estado"] == "Vigente":
                vigentes_por_termino[termino].add(proceso)

    ranking = sorted(conteo, key=lambda nombre: (-len(conteo[nombre]), -len(vigentes_por_termino[nombre]), nombre))
    elegidos: list[dict[str, object]] = [
        {"termino": nombre, "licitaciones": len(conteo[nombre]), "vigentes": len(vigentes_por_termino[nombre])}
        for nombre in ranking[:limite]
    ]
    if len(elegidos) < limite:
        ya = {item["termino"] for item in elegidos}
        for nombre, _ in Counter(nombre_por_cubso.values()).most_common():
            if len(elegidos) >= limite:
                break
            if nombre not in ya:
                elegidos.append({"termino": nombre, "licitaciones": 0, "vigentes": 0})
                ya.add(nombre)
    return elegidos


_DEPARTAMENTOS = (
    "AMAZONAS", "ANCASH", "APURIMAC", "AREQUIPA", "AYACUCHO", "CAJAMARCA", "CALLAO", "CUSCO", "HUANCAVELICA",
    "HUANUCO", "ICA", "JUNIN", "LA LIBERTAD", "LAMBAYEQUE", "LIMA", "LORETO", "MADRE DE DIOS", "MOQUEGUA",
    "PASCO", "PIURA", "PUNO", "SAN MARTIN", "TACNA", "TUMBES", "UCAYALI",
)


def _sin_tildes(texto: str | None) -> str:
    base = unicodedata.normalize("NFKD", texto or "")
    return "".join(ch for ch in base if not unicodedata.combining(ch)).upper()


def _departamento(texto: str | None) -> str:
    plano = _sin_tildes(texto)
    for nombre in _DEPARTAMENTOS:
        if nombre in plano:
            return nombre.title()
    return "Sin departamento"


def _comodin(valor: str) -> str:
    limpio = valor.replace("%", "").replace("_", "").strip()
    return f"%{limpio}%"


def _en_texto(valor: str):
    patron = _comodin(valor)
    return or_(
        Convocatoria.descripcion.ilike(patron),
        Convocatoria.entidad.ilike(patron),
        Convocatoria.nomenclatura_norm.ilike(patron),
    )


def _por_catalogo(termino: str, indice: int):
    """Las keywords del onboarding son etiquetas CUBSO, no texto de la convocatoria."""
    nombre = f"kw{indice}"
    return text(
        f"""
        exists (
          select 1
          from items_proceso i
          join cubso_ciiu_match m on m.cubso::text = i.codigo_cubso::text
          where i.nomenclatura_norm = convocatorias.nomenclatura_norm
            and m.descripcion ilike :{nombre}
        )
        """
    ).bindparams(**{nombre: _comodin(termino)})


@app.get("/api/licitaciones", response_model=PaginaLicitaciones)
def listar_licitaciones(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    keywords: str | None = None,
    departamento: str | None = None,
    objeto: str | None = None,
    etapa: str | None = None,
    entidad: str | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    portal: str | None = None,
    db: Session = Depends(get_db),
) -> PaginaLicitaciones:
    stmt = select(Convocatoria)
    portal_limpio = (portal or "").strip().lower()
    if portal_limpio == "menor":
        stmt = stmt.where(Convocatoria.ficha_url.ilike("%prod6.seace.gob.pe%"))
    elif portal_limpio == "mayor":
        stmt = stmt.where(Convocatoria.ficha_url.ilike("%prod2.seace.gob.pe%"))
    if objeto and objeto.strip():
        stmt = stmt.where(Convocatoria.objeto.ilike(objeto.strip()))
    if etapa and etapa.strip():
        patron = etapa.strip()
        stmt = stmt.where(or_(Convocatoria.etapa_seace.ilike(patron), Convocatoria.estado.ilike(patron)))
    if entidad and entidad.strip():
        stmt = stmt.where(Convocatoria.entidad.ilike(_comodin(entidad)))
    if fecha_desde:
        stmt = stmt.where(Convocatoria.fecha_publicacion >= fecha_desde)
    if fecha_hasta:
        stmt = stmt.where(Convocatoria.fecha_publicacion <= fecha_hasta)
    if departamento and departamento.strip() and departamento.strip().lower() != "todos":
        stmt = stmt.where(_en_texto(departamento))
    terminos = [parte.strip() for parte in (keywords or "").split(",") if parte.strip()]
    if terminos:
        stmt = stmt.where(
            or_(*(_en_texto(termino) | _por_catalogo(termino, indice) for indice, termino in enumerate(terminos)))
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    pages = math.ceil(total / limit) if total else 0
    filas = db.scalars(
        stmt.order_by(Convocatoria.fecha_publicacion.desc().nulls_last()).offset((page - 1) * limit).limit(limit)
    ).all()
    items: list[LicitacionOut] = []
    for fila in filas:
        item = LicitacionOut.model_validate(fila)
        item.departamento = _departamento(fila.descripcion)
        items.append(item)
    return PaginaLicitaciones(items=items, total=total, page=page, pages=pages)


@app.get("/api/licitaciones/{nomenclatura_norm:path}", response_model=LicitacionOut)
def detalle_licitacion(nomenclatura_norm: str, db: Session = Depends(get_db)) -> LicitacionOut:
    clave = nomenclatura_norm.strip()
    fila = db.get(Convocatoria, clave)
    if fila is None:
        raise HTTPException(status_code=404, detail="Licitación no encontrada")
    item = LicitacionOut.model_validate(fila)
    item.departamento = _departamento(fila.descripcion)
    return item


@app.post("/api/alertas/telegram")
def registrar_canal_telegram(body: AlertaTelegramIn) -> dict[str, object]:
    """El canal es solo la preferencia del onboarding. El envío lo hace n8n."""
    return {
        "canal": "telegram",
        "ruc": body.ruc,
        "razonSocial": body.razonSocial,
        "keywords": body.keywords,
        "ciius": body.ciius,
        "botUsername": "",
        "token": "",
        "url": "",
    }


@app.post("/api/analizar")
async def analizar(body: AnalizarIn) -> JSONResponse:
    webhook = os.getenv("N8N_WEBHOOK_URL", "").strip()
    if not webhook or "[TU_DOMINIO_N8N]" in webhook:
        raise HTTPException(status_code=503, detail="N8N_WEBHOOK_URL no está configurada")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(webhook, json=body.model_dump())
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="No se pudo contactar el webhook de n8n") from exc

    try:
        payload = response.json()
    except ValueError:
        payload = {"raw": response.text}

    return JSONResponse(status_code=response.status_code, content=payload)
