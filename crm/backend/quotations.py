"""Propuestas comerciales versionadas, partidas congeladas y estados registrados por el asesor."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal

from pydantic import Field, model_validator

from .commercial_utils import Input, cents, find, log, now, uid

ISSUER = {
    'name': 'INTERCERT LATAM S.A.C.', 'ruc': '20612137880',
    'address': 'CAL.MARTIN DE MURUA NRO. 150 INT. 1109 URB. MARANGA ET. SIETE LIMA - LIMA - SAN MIGUEL',
}


class QuoteLine(Input):
    productId: str = Field(min_length=1, max_length=100)
    quantity: int = Field(ge=1, le=1000)


class Quote(Input):
    dealId: str
    items: list[QuoteLine] = Field(default_factory=list, max_length=50)
    productId: str | None = None  # Contrato anterior de una partida.
    quantity: int = Field(default=1, ge=1, le=1000)
    title: str = Field(default='', max_length=160)
    discount: Decimal = Field(default=Decimal(0), ge=0, le=100, decimal_places=2)
    tax: Decimal = Field(default=Decimal(0), ge=0, le=100, decimal_places=2)
    taxIncluded: bool | None = None
    validUntil: date
    terms: str = Field(default='', max_length=4000)

    @model_validator(mode='after')
    def validate_lines(self):
        if bool(self.items) == bool(self.productId):
            raise ValueError('Selecciona entre una y cincuenta partidas, sin mezclar formatos.')
        ids = [line.productId for line in self.items]
        if len(set(ids)) != len(ids):
            raise ValueError('Un servicio está repetido: ajusta su cantidad en una sola partida.')
        return self


class QuoteState(Input):
    quoteId: str
    status: Literal['sent', 'accepted', 'rejected']
    recipient: str = Field(min_length=2, max_length=254)
    channel: Literal['email', 'whatsapp', 'other'] = 'other'
    note: str = Field(min_length=2, max_length=2000)


def quote_lines(quote):
    return quote.get('items') or [dict(productId=quote.get('productId'), productName=quote['productName'],
                                       unitPrice=quote['unitPrice'], quantity=quote['quantity'])]


def create_quote(state, data, actor):
    deal = find(state['deals'], data.dealId)
    if deal['stage'] in ['won', 'lost']:
        raise ValueError('Reabre el negocio antes de preparar otra cotización.')
    if any(q['dealId'] == deal['id'] and q['status'] == 'accepted' for q in state['quotes']):
        raise ValueError('El negocio ya tiene una propuesta aceptada. Registra una nueva necesidad como otro negocio.')
    lines = data.items or [QuoteLine(productId=data.productId, quantity=data.quantity)]
    items = []
    for line in lines:
        product = find(state['products'], line.productId)
        if not product['active']:
            raise ValueError('Un servicio seleccionado ya no está activo.')
        items.append(dict(productId=product['id'], productName=product['name'], unitPrice=product['price'], quantity=line.quantity))
    subtotal = sum(item['unitPrice'] * item['quantity'] for item in items)
    discount = cents(Decimal(subtotal) * data.discount / 100)
    included = data.taxIncluded if data.taxIncluded is not None else bool(data.items)
    tax = cents(Decimal(subtotal - discount) * data.tax / (100 + data.tax if included else 100))
    company = find(state['companies'], deal['companyId'])
    contact = next((c for c in state['contacts'] if c['id'] == deal['contactId']), {})
    version = 1 + sum(q['dealId'] == deal['id'] for q in state['quotes'])
    first = items[0]
    quote = dict(id=uid(), dealId=deal['id'], number=f'COT-{len(state["quotes"]) + 1:04d}', version=version,
                 title=data.title or deal['service'], items=items, events=[],
                 productId=first['productId'], productName=first['productName'], unitPrice=first['unitPrice'], quantity=first['quantity'],
                 subtotal=subtotal, discountPercent=float(data.discount), discountAmount=discount,
                 taxPercent=float(data.tax), taxIncluded=included, taxAmount=tax,
                 total=subtotal - discount + (0 if included else tax),
                 status='draft', validUntil=data.validUntil.isoformat(), terms=data.terms, createdAt=now(),
                 issuerName=ISSUER['name'], issuerRuc=ISSUER['ruc'], issuerAddress=ISSUER['address'],
                 customerName=company['name'], customerRuc=company['ruc'], contactName=contact.get('name', ''),
                 contactEmail=contact.get('email', ''), owner=deal['owner'])
    state['quotes'].append(quote)
    deal.update(amount=quote['total'], updatedAt=now())
    log(state, deal['id'], 'quote', f'{quote["number"]} · borrador v{version} con {len(items)} partidas. No enviado.', actor)


def change_quote_state(state, data, actor):
    quote = find(state['quotes'], data.quoteId)
    deal = find(state['deals'], quote['dealId'])
    current = quote['status']
    if deal['stage'] in ['won', 'lost']:
        raise ValueError('El negocio está cerrado; reábrelo antes de registrar cambios comerciales.')
    if (data.status == 'sent' and current != 'draft') or (data.status in ['accepted', 'rejected'] and current != 'sent'):
        raise ValueError('Solo se envía un borrador; la aceptación o rechazo requiere una propuesta enviada.')
    commercial_today = datetime.now(timezone(timedelta(hours=-5))).date()
    if data.status in ['sent', 'accepted'] and date.fromisoformat(quote['validUntil']) < commercial_today:
        raise ValueError('La propuesta venció. Prepara una nueva versión con vigencia actualizada.')
    if data.status == 'sent' and not quote['terms'].strip():
        raise ValueError('Prepara una versión con condiciones comerciales antes de registrar su envío.')
    if data.status == 'accepted' and any(q['id'] != quote['id'] and q['dealId'] == deal['id'] and q['status'] == 'accepted' for q in state['quotes']):
        raise ValueError('El negocio ya tiene otra propuesta aceptada.')
    quote.setdefault('events', []).append(dict(id=uid(), status=data.status, recipient=data.recipient,
                                               channel=data.channel, note=data.note, actor=actor, createdAt=now()))
    quote['status'] = data.status
    if data.status == 'sent' and deal['stage'] in ['new', 'contacted', 'qualified']:
        deal['stage'] = 'quoted'
    if data.status == 'accepted':
        deal['amount'] = quote['total']
    deal['updatedAt'] = now()
    label = {'sent': 'Envío externo registrado', 'accepted': 'Aceptación registrada', 'rejected': 'Rechazo registrado'}[data.status]
    log(state, deal['id'], 'quote', f'{quote["number"]} · {label}. {data.recipient}: {data.note}', actor)
