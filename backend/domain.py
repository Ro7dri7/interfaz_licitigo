"""Commercial rules shared by the local pilot and Supabase persistence."""
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import json
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

STAGES = ['new', 'contacted', 'qualified', 'quoted', 'followup', 'won', 'lost']
LABELS = dict(zip(STAGES, ['Nuevo', 'Contactado', 'Necesidad validada', 'Cotización enviada', 'Seguimiento', 'Ganado', 'Perdido']))


def now():
    return datetime.now(timezone.utc).isoformat()


def uid():
    return str(uuid4())


def empty_state():
    return {key: [] for key in ['companies', 'contacts', 'prospects', 'deals', 'tasks', 'activities', 'products', 'quotes', 'receipts']}


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Intake(Input):
    company: str = Field(min_length=2, max_length=160)
    ruc: str = Field(default='', pattern=r'^(\d{11})?$')
    contact: str = Field(default='', max_length=100)
    email: EmailStr | Literal[''] = ''
    phone: str = Field(default='', max_length=30, pattern=r'^[+\d\s()\-]*$')
    origin: Literal['Lici', 'WhatsApp', 'Referido', 'Campaña', 'Manual', 'Partner'] = 'Manual'
    kind: Literal['signal', 'advice', 'quote', 'manual'] = 'manual'
    service: str = Field(min_length=2, max_length=160)
    owner: str = Field(default='Sin asignar', min_length=2, max_length=80)
    evidence: Literal['required', 'recommended', 'pending', 'none'] = 'none'
    tender: str = Field(default='', max_length=160)
    deadline: date | None = None
    notes: str = Field(default='', max_length=3000)


class Convert(Input):
    prospectId: str


class Move(Input):
    dealId: str
    stage: Literal['new', 'contacted', 'qualified', 'quoted', 'followup', 'won', 'lost']
    reason: str = Field(default='', max_length=1000)


class Activity(Input):
    dealId: str
    text: str = Field(min_length=2, max_length=3000)
    kind: Literal['note', 'call', 'meeting'] = 'note'


class Task(Input):
    dealId: str
    title: str = Field(min_length=2, max_length=200)
    dueAt: datetime

    @field_validator('dueAt')
    @classmethod
    def aware_date(cls, value):
        if value.tzinfo is None:
            raise ValueError('La tarea requiere fecha con zona horaria.')
        return value.astimezone(timezone.utc)


class Complete(Input):
    taskId: str


class Product(Input):
    name: str = Field(min_length=2, max_length=160)
    price: Decimal = Field(ge=0, le=10000000, decimal_places=2)


class Quote(Input):
    dealId: str
    productId: str
    quantity: int = Field(ge=1, le=1000)
    discount: Decimal = Field(default=Decimal(0), ge=0, le=100, decimal_places=2)
    tax: Decimal = Field(default=Decimal(0), ge=0, le=100, decimal_places=2)
    validUntil: date
    terms: str = Field(default='', max_length=2000)


SCHEMAS = {'intake': Intake, 'convert': Convert, 'stage': Move, 'activity': Activity,
           'task': Task, 'complete_task': Complete, 'product': Product, 'quote': Quote}


def find(rows, identifier):
    for row in rows:
        if row['id'] == identifier:
            return row
    raise ValueError('El registro ya no está disponible. Actualiza la página.')


def log(state, deal_id, kind, text, actor):
    state['activities'].append(dict(id=uid(), dealId=deal_id, kind=kind, text=text, actor=actor, createdAt=now()))


def matching_deal(state, prospect):
    return next((d for d in state['deals'] if d['companyId'] == prospect['companyId']
                 and d['service'].casefold() == prospect['service'].casefold() and d['stage'] not in ['won', 'lost']), None)


def open_deal(state, prospect, actor):
    deal = matching_deal(state, prospect)
    if not deal:
        deal = dict(id=uid(), companyId=prospect['companyId'], contactId=prospect['contactId'],
                    service=prospect['service'], origin=prospect['origin'], owner=prospect['owner'], stage='new',
                    amount=0, createdAt=now(), updatedAt=now(), closedAt=None, lossReason='', prospectIds=[])
        state['deals'].append(deal)
        log(state, deal['id'], 'created', 'Negocio abierto. Pendiente de primera atención.', actor)
        state['tasks'].append(dict(id=uid(), dealId=deal['id'], title='Realizar primera atención',
                                   dueAt=(datetime.now(timezone.utc) + timedelta(days=1)).isoformat(), done=False, completedAt=None))
    for p in state['prospects']:
        if p['companyId'] == prospect['companyId'] and p['service'].casefold() == prospect['service'].casefold() and not p.get('dealId'):
            p['dealId'] = deal['id']
            deal['prospectIds'].append(p['id'])
    return deal


def receive_intake(state, data, actor):
    # RUC is the only automatic company identity; names and shared phones are not unique.
    company = next((c for c in state['companies'] if data.ruc and c['ruc'] == data.ruc), None)
    if not company:
        company = dict(id=uid(), name=data.company, ruc=data.ruc, origin=data.origin, createdAt=now())
        state['companies'].append(company)
    contact = next((c for c in state['contacts'] if c['companyId'] == company['id'] and data.email
                    and c['email'].casefold() == str(data.email).casefold()), None)
    if not contact and (data.contact or data.email or data.phone):
        contact = dict(id=uid(), companyId=company['id'], name=data.contact or 'Contacto por completar',
                       email=str(data.email), phone=data.phone)
        state['contacts'].append(contact)
    prospect = dict(id=uid(), companyId=company['id'], contactId=contact['id'] if contact else None,
                    kind=data.kind, origin=data.origin, service=data.service, owner=data.owner, evidence=data.evidence,
                    tender=data.tender, deadline=data.deadline.isoformat() if data.deadline else None,
                    notes=data.notes, createdAt=now(), dealId=None)
    state['prospects'].append(prospect)
    if data.kind in ['advice', 'quote']:
        deal = open_deal(state, prospect, actor)
        log(state, deal['id'], 'request', 'Cotización solicitada' if data.kind == 'quote' else 'Asesoría solicitada', actor)
    elif data.kind == 'signal' and matching_deal(state, prospect):
        deal = open_deal(state, prospect, actor)
        log(state, deal['id'], 'signal', 'Nueva señal vinculada al negocio existente; no implica una solicitud.', actor)


def cents(value):
    return int(value.quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def create_quote(state, data, actor):
    deal = find(state['deals'], data.dealId)
    if deal['stage'] in ['won', 'lost']:
        raise ValueError('Reabre el negocio antes de preparar otra cotización.')
    product = find(state['products'], data.productId)
    subtotal = product['price'] * data.quantity
    discount = cents(Decimal(subtotal) * data.discount / 100)
    tax = cents(Decimal(subtotal - discount) * data.tax / 100)
    version = 1 + sum(q['dealId'] == deal['id'] for q in state['quotes'])
    quote = dict(id=uid(), dealId=deal['id'], productId=product['id'], number=f'COT-{len(state["quotes"]) + 1:04d}', version=version,
                 productName=product['name'], unitPrice=product['price'], quantity=data.quantity,
                 subtotal=subtotal, discountPercent=float(data.discount), discountAmount=discount,
                 taxPercent=float(data.tax), taxAmount=tax, total=subtotal - discount + tax,
                 status='draft', validUntil=data.validUntil.isoformat(), terms=data.terms, createdAt=now())
    state['quotes'].append(quote)
    deal['amount'] = quote['total']
    deal['updatedAt'] = now()
    log(state, deal['id'], 'quote', f'{quote["number"]} · borrador v{version} preparado. No enviado.', actor)


def apply_command(original, operation, payload, actor, request_id):
    if operation not in SCHEMAS:
        raise ValueError('Operación no reconocida.')
    digest = hashlib.sha256(json.dumps([operation, payload], sort_keys=True).encode()).hexdigest()
    receipt = next((r for r in original['receipts'] if r['id'] == request_id), None)
    if receipt:
        if receipt['digest'] != digest:
            raise ValueError('El identificador de esta operación ya se utilizó con otros datos.')
        return original
    data = SCHEMAS[operation].model_validate(payload)
    state = deepcopy(original)
    if operation == 'intake':
        receive_intake(state, data, actor)
    elif operation == 'convert':
        p = find(state['prospects'], data.prospectId)
        if p['dealId']:
            raise ValueError('Este prospecto ya está asociado a un negocio. Abre su ficha para continuar.')
        deal = open_deal(state, p, actor)
        log(state, deal['id'], 'qualification', 'Interés confirmado por el asesor desde prospectos.', actor)
    elif operation == 'stage':
        deal = find(state['deals'], data.dealId)
        if data.stage == 'lost' and not data.reason.strip():
            raise ValueError('Indica el motivo de pérdida.')
        if data.stage == 'won' and deal['amount'] <= 0:
            raise ValueError('Prepara una cotización con monto antes de cerrar la venta.')
        if deal['stage'] != data.stage:
            deal.update(stage=data.stage, updatedAt=now(), closedAt=now() if data.stage in ['won', 'lost'] else None,
                        lossReason=data.reason if data.stage == 'lost' else '')
            log(state, deal['id'], 'stage', f'Etapa: {LABELS[data.stage]}' + (f' · {data.reason}' if data.reason else ''), actor)
    elif operation == 'activity':
        find(state['deals'], data.dealId)
        log(state, data.dealId, data.kind, data.text, actor)
    elif operation == 'task':
        find(state['deals'], data.dealId)
        state['tasks'].append(dict(id=uid(), dealId=data.dealId, title=data.title, dueAt=data.dueAt.isoformat(), done=False, completedAt=None))
        log(state, data.dealId, 'task', f'Tarea programada: {data.title}', actor)
    elif operation == 'complete_task':
        task = find(state['tasks'], data.taskId)
        if not task['done']:
            task.update(done=True, completedAt=now())
            log(state, task['dealId'], 'task', f'Tarea completada: {task["title"]}', actor)
    elif operation == 'product':
        state['products'].append(dict(id=uid(), name=data.name, price=cents(data.price * 100), currency='PEN', active=True))
    elif operation == 'quote':
        create_quote(state, data, actor)
    state['receipts'].append(dict(id=request_id, digest=digest))
    return state
