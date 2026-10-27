"""Generate realistic SQL test commands from the same Python domain and row codec as the API."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.domain import apply_command, empty_state
from backend.relational_codec import changes_between, QUOTE_DOCUMENT_FIELDS
from backend.sql_names import cambios_sql

workspace = '10000000-0000-0000-0000-000000000001'
state, events = empty_state(), []
operations = [
    ('intake', {'company': 'Prueba SQL', 'ruc': '20998877665', 'contact': 'Ana', 'email': 'sql@example.com', 'service': 'ISO 9001', 'origin': 'Lici', 'kind': 'signal', 'evidence': 'required'}),
    ('intake', {'company': 'Prueba SQL', 'ruc': '20998877665', 'service': 'ISO 9001', 'origin': 'WhatsApp', 'kind': 'quote'}),
    ('product', {'name': 'ISO 9001', 'price': '100.05'}),
]
for index in range(6):
    if index < len(operations):
        operation,payload = operations[index]
    elif index == 3:
        operation,payload = 'quote', {'dealId': state['deals'][0]['id'], 'productId': state['products'][0]['id'], 'quantity': 3, 'discount': '10', 'tax': '18', 'validUntil': '2027-12-31'}
    elif index == 4:
        operation,payload = 'complete_task', {'taskId': state['tasks'][0]['id']}
    else:
        operation,payload = 'stage', {'dealId': state['deals'][0]['id'], 'stage': 'won'}
    updated = apply_command(state,operation,payload,'SQL admin',f'sql-{index}')
    changes = changes_between(state, updated, workspace)
    legacy = [{**change, 'row': {key: value for key, value in change['row'].items() if
               change['table'] != 'quotes' or key not in QUOTE_DOCUMENT_FIELDS.values()}} for change in changes]
    events.append({'changes': cambios_sql(changes), 'legacyChanges': legacy,
                   'receipt':updated['receipts'][-1], 'revision':index,'operation':operation})
    state=updated
multiple_state, multiple_events = empty_state(), []
for index in range(8):
    if index < 3:
        operation, payload = operations[index]
    elif index == 3:
        operation, payload = 'product', {'name': 'Pack ISO 14001 + 45001', 'price': '200.10'}
    elif index == 4:
        operation, payload = 'quote', {'dealId': multiple_state['deals'][0]['id'], 'items': [
            {'productId': p['id'], 'quantity': 3 if i == 0 else 1} for i,p in enumerate(multiple_state['products'])],
            'discount': '10', 'tax': '18', 'taxIncluded': True, 'validUntil': '2099-12-31', 'terms': 'Pago por acuerdo comercial.'}
    elif index == 5:
        operation, payload = 'quote_status', {'quoteId': multiple_state['quotes'][0]['id'], 'status': 'sent', 'recipient': 'Ana', 'channel': 'email', 'note': 'Enviada externamente por correo.'}
    elif index == 6:
        operation, payload = 'quote_status', {'quoteId': multiple_state['quotes'][0]['id'], 'status': 'accepted', 'recipient': 'Ana', 'channel': 'email', 'note': 'Confirmación de aceptación por correo.'}
    else:
        operation, payload = 'stage', {'dealId': multiple_state['deals'][0]['id'], 'stage': 'won'}
    updated = apply_command(multiple_state, operation, payload, 'SQL admin', f'multiple-{index}')
    multiple_events.append({'changes': cambios_sql(changes_between(multiple_state,updated,workspace)), 'receipt':updated['receipts'][-1], 'revision':index})
    multiple_state = updated
print(json.dumps({'events':events,'final':state, 'multipleEvents': multiple_events}))
