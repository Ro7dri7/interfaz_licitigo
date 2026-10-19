"""Generate realistic SQL test commands from the same Python domain and row codec as the API."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.domain import apply_command, empty_state
from backend.relational_codec import changes_between
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
    events.append({'changes': cambios_sql(changes), 'legacyChanges': changes,
                   'receipt':updated['receipts'][-1], 'revision':index,'operation':operation})
    state=updated
print(json.dumps({'events':events,'final':state}))
