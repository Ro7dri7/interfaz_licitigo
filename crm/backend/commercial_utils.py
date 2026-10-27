"""Validación y utilidades comunes del dominio comercial."""
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4
from pydantic import BaseModel, ConfigDict


def now():
    return datetime.now(timezone.utc).isoformat()


def uid():
    return str(uuid4())


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


def find(rows, identifier):
    for row in rows:
        if row['id'] == identifier:
            return row
    raise ValueError('El registro ya no está disponible. Actualiza la página.')


def log(state, deal_id, kind, text, actor):
    state['activities'].append(dict(id=uid(), dealId=deal_id, kind=kind, text=text, actor=actor, createdAt=now()))


def cents(value):
    return int(value.quantize(Decimal('1'), rounding=ROUND_HALF_UP))


