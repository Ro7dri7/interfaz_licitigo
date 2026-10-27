"""Fuentes externas por RUC: API MIGO (SUNAT en tiempo real) y ficha RNP del OECE."""

import re

import httpx

from .config import get_settings


class FuenteError(RuntimeError):
    pass


# "Principal - 4100 - CONSTRUCCIÓN DE EDIFICIOS" / "Secundaria 1 - 7110 - ACTIVIDADES DE ..."
_RE_ACTIVIDAD = re.compile(r"^\s*(Principal|Secundaria\s*\d*)\s*-\s*(\d{4})\s*-\s*(.+?)\s*$", re.IGNORECASE)


def parsear_actividades(lineas: list[str]) -> list[dict]:
    ciius: list[dict] = []
    for linea in lineas or []:
        m = _RE_ACTIVIDAD.match(str(linea))
        if m and all(c["codigo"] != m.group(2) for c in ciius):
            ciius.append({
                "codigo": m.group(2),
                "descripcion": m.group(3).strip(),
                "tipo": m.group(1).strip().capitalize(),
                "origen": "oficial",
            })
    return ciius


async def consultar_migo(ruc: str) -> dict:
    """GET /ruc/{ruc}/sunat de API MIGO. Lanza FuenteError con un mensaje legible si falla."""
    s = get_settings()
    try:
        async with httpx.AsyncClient(timeout=20) as http:
            resp = await http.get(
                f"{s.apimigo_base_url}/ruc/{ruc}/sunat",
                headers={"Authorization": f"Bearer {s.apimigo_token}", "Accept": "application/json"},
            )
    except httpx.HTTPError as e:
        raise FuenteError(f"API MIGO no responde: {e}") from e

    if resp.status_code == 401:
        raise FuenteError("API MIGO: token inválido")
    if resp.status_code == 403:
        raise FuenteError("API MIGO: plan o suscripción vencida (renovar en api.migo.pe)")
    if resp.status_code == 404:
        raise FuenteError("RUC no encontrado en SUNAT")
    data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    if resp.status_code >= 400 or data.get("success") is False:
        raise FuenteError(f"API MIGO HTTP {resp.status_code}: {data.get('message') or resp.text[:200]}")
    return data


async def consultar_rnp(ruc: str) -> dict | None:
    """Ficha pública del proveedor en el RNP (OECE). None si no está inscrito o el servicio falla."""
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            resp = await http.get(
                f"https://eap.oece.gob.pe/perfilprov-bus/1.0/ficha/{ruc}",
                headers={"Accept": "application/json", "Origin": "https://apps.oece.gob.pe",
                         "User-Agent": "Mozilla/5.0 (Lici backend)"},
            )
        if resp.status_code != 200:
            return None
        prov = (resp.json() or {}).get("proveedorT01") or {}
    except (httpx.HTTPError, ValueError):
        return None
    if not prov.get("numRuc"):
        return None

    tip_reg = str(prov.get("lscIdTipRegVig") or prov.get("lscIdTipReg") or "")
    tipos = [nombre for cod, nombre in (("1", "Bienes"), ("2", "Servicios"), ("3", "Consultoria de Obras"), ("4", "Obras"))
             if cod in tip_reg]
    especialidades = []
    for esp in prov.get("espProvT01s") or []:
        des, cat = (esp.get("desEsp") or "").strip(), (esp.get("desCat") or "").strip()
        if des:
            especialidades.append(f"{des} (Cat. {cat})" if cat else des)

    return {
        "razon_social": (prov.get("nomRzsProv") or "").strip(),
        "habilitado": bool(prov.get("esHabilitado")),
        "apto_contratar": bool(prov.get("esAptoContratar")),
        "tipos": tipos,
        "especialidades": especialidades,
        "capacidad_maxima": prov.get("cmcTexto") or None,
        "telefonos": [t.strip() for t in prov.get("telefonos") or [] if t and t.strip()],
        "emails": [e.strip() for e in prov.get("emails") or [] if e and e.strip()],
    }


def inferir_ciius(razon_social: str, tipos_rnp: list[str], especialidades: list[str]) -> list[str]:
    """Respaldo cuando API MIGO no trae actividades: deduce CIIU por registros/especialidades RNP y razón social."""
    ciius: list[str] = []

    def add(*cods: str) -> None:
        ciius.extend(c for c in cods if c not in ciius)

    rz = (razon_social or "").lower()
    esps = " ".join(especialidades).lower()
    if any(k in esps for k in ("vial", "carretera", "puente")):
        add("4210", "7110")
    if "saneamiento" in esps or "agua" in esps:
        add("4220", "7110")
    if "edificac" in esps or "urbana" in esps:
        add("4100", "7110")
    if "electromec" in esps or "energ" in esps:
        add("4321", "7110")
    if "represa" in esps or "irrigac" in esps:
        add("4290", "7110")
    if "Consultoria de Obras" in tipos_rnp:
        add("7110")
    if "Obras" in tipos_rnp and not ciius:
        add("4100", "4210")
    if any(k in rz for k in ("constructora", "construccion", "edificaciones", "obras")):
        add("4100", "4210")
    if any(k in rz for k in ("ingenieros", "ingenieria", "consultores", "consultoria", "arquitect")):
        add("7110")
    if any(k in rz for k in ("seguridad", "vigilancia", "resguardo", "security")):
        add("8010")
    if any(k in rz for k in ("limpieza", "servicios generales", "mantenimiento")):
        add("8121")
    if any(k in rz for k in ("software", "sistemas", "tecnologia", "tech", "soluciones ti")):
        add("6201", "6202")
    if any(k in rz for k in ("farma", "medica", "salud", "laboratorio", "drogueria")):
        add("4646", "2100")
    if any(k in rz for k in ("transporte", "logistica", "flete", "cargo")):
        add("4923")
    if not ciius:
        if "Servicios" in tipos_rnp:
            add("7020")
        elif "Bienes" in tipos_rnp:
            add("4651")
    return ciius
