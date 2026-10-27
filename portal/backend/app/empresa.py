"""Perfil de empresa por RUC: API MIGO (fuente principal) + RNP del OECE (vigencia y registros)."""

import asyncio
import json
import logging
from pathlib import Path

from .fuentes import FuenteError, consultar_migo, consultar_rnp, inferir_ciius, parsear_actividades
from .supabase import SupabaseError, get_db

log = logging.getLogger(__name__)

CIIU_TITULOS: dict[str, str] = json.loads(
    (Path(__file__).parent / "data" / "ciiu_rev4.json").read_text(encoding="utf-8")
)


class EmpresaNoEncontrada(LookupError):
    pass


def ruc_valido(ruc: str) -> bool:
    return len(ruc) == 11 and ruc.isdigit() and ruc[:2] in ("10", "15", "17", "20")


async def obtener_empresa(ruc: str) -> dict:
    migo_res, rnp = await asyncio.gather(consultar_migo(ruc), consultar_rnp(ruc), return_exceptions=True)
    if isinstance(rnp, BaseException):
        rnp = None
    migo = None if isinstance(migo_res, BaseException) else migo_res
    migo_error = str(migo_res) if isinstance(migo_res, FuenteError) else None
    if isinstance(migo_res, BaseException) and not isinstance(migo_res, FuenteError):
        log.exception("Fallo inesperado consultando API MIGO", exc_info=migo_res)
        migo_error = "API MIGO no disponible"

    if migo is None and rnp is None:
        raise EmpresaNoEncontrada(migo_error or "RUC no encontrado")

    migo = migo or {}
    rnp = rnp or {}
    ciius = parsear_actividades(migo.get("actividades_economicas") or [])
    if not ciius:
        # Solo si SUNAT no trae actividades: heurística por RNP y razón social.
        razon = migo.get("nombre_o_razon_social") or rnp.get("razon_social") or ""
        ciius = [
            {"codigo": c, "descripcion": CIIU_TITULOS.get(c, ""), "tipo": "Inferido (RNP)", "origen": "inferido"}
            for c in inferir_ciius(razon, rnp.get("tipos", []), rnp.get("especialidades", []))
        ]

    estado = (migo.get("estado_del_contribuyente") or "").upper() or None
    condicion = (migo.get("condicion_de_domicilio") or "").upper() or None
    ubicacion = [migo.get(k) for k in ("departamento", "provincia", "distrito") if migo.get(k)]

    empresa = {
        "ruc": ruc,
        "razonSocial": migo.get("nombre_o_razon_social") or rnp.get("razon_social") or "",
        "nombreComercial": migo.get("nombre_comercial") if migo.get("nombre_comercial") not in (None, "", "-") else None,
        "estadoSunat": estado,
        "condicionSunat": " / ".join(x for x in (condicion, estado) if x) or "SIN DATOS SUNAT",
        "condicionDomicilio": condicion,
        "sunatOk": estado == "ACTIVO" and condicion == "HABIDO",
        "rnpVigente": bool(rnp.get("habilitado")),
        "aptoContratar": bool(rnp.get("apto_contratar")),
        "tiposRnp": rnp.get("tipos", []),
        "especialidadesRnp": rnp.get("especialidades", []),
        "capacidadMaxima": rnp.get("capacidad_maxima") or "No registra",
        "rubro": ciius[0]["descripcion"] if ciius else "Sin actividad registrada",
        "ciius": ciius,
        "departamento": migo.get("departamento"),
        "provincia": migo.get("provincia"),
        "distrito": migo.get("distrito"),
        "ubicacion": " · ".join(ubicacion) if ubicacion else "No registra",
        "direccion": migo.get("direccion"),
        "telefono": " / ".join(rnp.get("telefonos", [])) or None,
        "email": " / ".join(rnp.get("emails", [])) or None,
        "avisos": [a for a in [migo_error and f"{migo_error}. Datos parciales desde el RNP."] if a],
    }
    await guardar_empresa(empresa, ciiu_oficial_ok=migo_error is None)
    return empresa


async def guardar_empresa(e: dict, ciiu_oficial_ok: bool) -> None:
    """
    Upsert en proveedores/proveedor_ciiu con la función guardar_perfil_empresa (la misma que usan los flujos n8n,
    así el formato del perfil es uno solo). Si MIGO falló se conservan los CIIU oficiales que ya había.
    """
    si_no = lambda v: "SI" if v else "No"  # noqa: E731
    perfil = {
        "ruc": e["ruc"],
        "razonSocial": e["razonSocial"],
        "estadoSunat": e["estadoSunat"] or "No registra",
        "condicionSunat": e["condicionDomicilio"] or "No registra",
        "departamento": (e["departamento"] or "NO REGISTRA").upper(),
        "provincia": (e["provincia"] or "NO REGISTRA").upper(),
        "distrito": (e["distrito"] or "NO REGISTRA").upper(),
        "habilitadoRnp": si_no(e["rnpVigente"]),
        "aptoContratar": si_no(e["aptoContratar"]),
        "tiposRnp": e["tiposRnp"],
        "especialidadesObras": e["especialidadesRnp"],
        "telefono": e["telefono"] or "No registra",
        "email": e["email"] or "No registra",
        "ciiuOficialOk": ciiu_oficial_ok,
        "ciiuDetalle": [
            {"codigo": c["codigo"], "texto": c["descripcion"],
             "fuente": f"{c['tipo']} (SUNAT tiempo real)" if c["origen"] == "oficial" else "RNP / Heurística"}
            for c in e["ciius"]
        ],
    }
    try:
        await get_db().rpc("guardar_perfil_empresa", {"p": perfil})
    except SupabaseError as err:
        log.warning("No se pudo guardar la empresa %s: %s", e["ruc"], err)


async def ciius_guardados(ruc: str) -> list[dict]:
    """CIIU guardados del RUC (proveedor_ciiu), oficiales primero."""
    try:
        filas = await get_db().select("proveedor_ciiu", {
            "select": "ciiu,descripcion,tipo,origen,orden", "ruc": f"eq.{ruc}", "order": "orden",
        })
    except SupabaseError:
        return []
    filas.sort(key=lambda f: (f["origen"] != "oficial", f["orden"]))
    return [
        {"codigo": f["ciiu"], "descripcion": f.get("descripcion") or CIIU_TITULOS.get(f["ciiu"], ""),
         "tipo": f.get("tipo") or "", "origen": f["origen"]}
        for f in filas
    ]


async def empresa_guardada(ruc: str) -> dict | None:
    """Ficha de la empresa desde la base (sin volver a consultar SUNAT/RNP)."""
    filas, ciius = await asyncio.gather(
        get_db().select("proveedores", {"select": "*", "ruc": f"eq.{ruc}"}, limit=1), ciius_guardados(ruc))
    if not filas:
        return None
    p = filas[0]
    if ciius:
        # CIIU genéricos ('venta al por mayor no especializada'...): calzan con casi todo y pesan menos al recomendar.
        try:
            amp = await get_db().select("ciiu_amplitud", {
                "select": "ciiu,generico", "ciiu": f"in.({','.join(c['codigo'] for c in ciius)})"})
        except SupabaseError:
            amp = []
        genericos = {a["ciiu"] for a in amp if a.get("generico")}
        for c in ciius:
            c["generico"] = c["codigo"] in genericos
    estado = p.get("estado_sunat") if p.get("estado_sunat") not in (None, "N/D", "No registra") else None
    condicion = p.get("condicion_domicilio") if p.get("condicion_domicilio") not in (None, "N/D", "No registra") else None
    ubicacion = [p[k] for k in ("departamento", "provincia", "distrito") if p.get(k) and p[k] != "NO REGISTRA"]
    return {
        "ruc": ruc,
        "razonSocial": p.get("razon_social") or "",
        "nombreComercial": p.get("nombre_comercial"),
        "estadoSunat": estado,
        "condicionSunat": " / ".join(x for x in (condicion, estado) if x) or "SIN DATOS SUNAT",
        "sunatOk": estado == "ACTIVO" and condicion == "HABIDO",
        "rnpVigente": (p.get("habilitado_rnp") or "").upper() in ("SI", "SÍ"),
        "aptoContratar": (p.get("apto_contratar") or "").upper() in ("SI", "SÍ"),
        "tiposRnp": p.get("tipos_rnp") or [],
        "especialidadesRnp": p.get("especialidades_rnp") or [],
        "capacidadMaxima": "No registra",
        "rubro": ciius[0]["descripcion"] if ciius else "Sin actividad registrada",
        "ciius": ciius,
        "departamento": p.get("departamento"),
        "provincia": p.get("provincia"),
        "distrito": p.get("distrito"),
        "ubicacion": " · ".join(ubicacion) if ubicacion else "No registra",
        "direccion": p.get("direccion"),
        "telefono": p.get("telefono_rnp") if p.get("telefono_rnp") != "No registra" else None,
        "email": p.get("email_rnp") if p.get("email_rnp") != "No registra" else None,
        "fichaRnpUrl": p.get("ficha_rnp_url"),
        "actualizadoEl": p.get("sunat_actualizado_at") or p.get("updated_at"),
        "avisos": [],
    }
