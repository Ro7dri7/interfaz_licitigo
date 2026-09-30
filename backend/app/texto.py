"""Normalización de texto para comparar descripciones SEACE con nombres de ítems CUBSO."""

import re
import unicodedata

STOPWORDS = {
    "de", "del", "la", "las", "el", "los", "y", "e", "o", "u", "en", "para", "con", "a", "al", "por",
    "su", "sus", "un", "una", "que", "se", "sin", "segun", "tipo", "x", "n", "nro", "no",
}

# Palabras que aparecen en casi cualquier proceso: no sirven para decidir si algo es del rubro.
GENERICAS = {
    "servicio", "adquisicion", "contratacion", "compra", "suministro", "bien", "obra",
    "general", "diverso", "vario", "otro", "uso", "unidad", "material", "equipo", "accesorio",
    "producto", "articulo", "insumo", "similar", "afin", "especializado", "personal", "apoyo",
    # ubicación: "... distrito de X, provincia de Y, departamento de Z" está en casi toda descripción de obra
    "departamento", "provincia", "distrito", "region", "regional", "sector", "municipalidad", "municipal",
    "gobierno", "nacional", "peru", "local", "zona", "localidad", "poblado", "caserio", "anexo",
}


def normalizar(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", (s or "").lower()).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def _raiz(w: str) -> str:
    """Singulariza lo justo para que 'servidores'/'servidor' o 'computadoras'/'computadora' coincidan."""
    if len(w) > 5 and w.endswith("es") and w[-3] in "rlndz":
        return w[:-2]
    if len(w) > 4 and w.endswith("s"):
        return w[:-1]
    return w


def tokens(s: str | None) -> set[str]:
    return {_raiz(w) for w in normalizar(s).split() if w not in STOPWORDS and not w.isdigit()}


def tokens_significativos(s: str | None) -> frozenset[str]:
    return frozenset(w for w in tokens(s) if w not in GENERICAS and len(w) >= 3)


def etiqueta_termino(descripcion_cubso: str | None) -> str:
    """
    Nombre legible del ítem CUBSO, sin la variante ni las medidas:
      'SERVICIO DE ANALISIS DE LABORATORIO - SULFATOS' -> 'SERVICIO DE ANALISIS DE LABORATORIO'
      'TUBO DE ACERO 1 1/4 in X 3 m'                  -> 'TUBO DE ACERO'
      'ALCOHOL ETILICO (ETANOL) 70 % GEL X 60 mL'      -> 'ALCOHOL ETILICO'
    """
    base = re.sub(r"\([^)]*\)", " ", (descripcion_cubso or "").split(" - ", 1)[0])
    palabras: list[str] = []
    for w in base.split():
        if any(ch.isdigit() for ch in w):
            break
        palabras.append(w)
    while palabras and (normalizar(palabras[-1]) in STOPWORDS or len(normalizar(palabras[-1])) <= 1):
        palabras.pop()
    return " ".join(palabras).strip(" .,;:-").upper()
