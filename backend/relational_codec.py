"""Translate the existing UI contract to typed relational rows, never a saved workspace blob."""
from copy import deepcopy
from uuid import NAMESPACE_URL, uuid5

TABLE_FIELDS = {
    'companies': {'id': 'id', 'name': 'name', 'ruc': 'ruc', 'origin': 'origin', 'createdAt': 'created_at'},
    'contacts': {'id': 'id', 'companyId': 'company_id', 'name': 'name', 'email': 'email', 'phone': 'phone'},
    'products': {'id': 'id', 'name': 'name', 'price': 'price', 'currency': 'currency', 'active': 'active'},
    'deals': {'id': 'id', 'companyId': 'company_id', 'contactId': 'contact_id', 'service': 'service',
              'origin': 'origin', 'owner': 'owner_label', 'stage': 'stage', 'amount': 'amount',
              'createdAt': 'created_at', 'updatedAt': 'updated_at', 'closedAt': 'closed_at', 'lossReason': 'loss_reason'},
    'prospects': {'id': 'id', 'companyId': 'company_id', 'contactId': 'contact_id', 'kind': 'kind',
                  'origin': 'origin', 'service': 'service', 'owner': 'owner_label', 'evidence': 'evidence',
                  'tender': 'tender', 'deadline': 'deadline', 'notes': 'notes', 'createdAt': 'created_at', 'dealId': 'deal_id'},
    'tasks': {'id': 'id', 'dealId': 'deal_id', 'title': 'title', 'dueAt': 'due_at', 'done': 'done', 'completedAt': 'completed_at'},
    'activities': {'id': 'id', 'dealId': 'deal_id', 'kind': 'kind', 'text': 'body', 'actor': 'actor_label', 'createdAt': 'created_at'},
    'quotes': {'id': 'id', 'dealId': 'deal_id', 'number': 'number', 'version': 'version', 'subtotal': 'subtotal',
               'discountPercent': 'discount_percent', 'discountAmount': 'discount_amount', 'taxPercent': 'tax_percent',
               'taxAmount': 'tax_amount', 'total': 'total', 'status': 'status', 'validUntil': 'valid_until',
               'terms': 'terms', 'createdAt': 'created_at'},
    'receipts': {'id': 'request_id', 'digest': 'digest'},
}
# FK dependency order. A prospect may reference a deal, which references a contact.
WRITE_ORDER = ['companies', 'contacts', 'products', 'deals', 'prospects', 'tasks', 'activities', 'quotes', 'quote_items']


def encode_state(data, workspace):
    tables = {}
    for table, mapping in TABLE_FIELDS.items():
        tables[table] = []
        for index, entity in enumerate(data[table]):
            row = {column: entity.get(field) for field, column in mapping.items()}
            row.update(workspace_id=workspace, sort_order=index)
            if table == 'companies':
                row['ruc'] = row['ruc'] or None
            tables[table].append(row)
    tables['quote_items'] = [dict(workspace_id=workspace, quote_id=q['id'], line_number=1,
                                  product_id=q.get('productId'), product_name=q['productName'],
                                  unit_price=q['unitPrice'], quantity=q['quantity']) for q in data['quotes']]
    return tables


def decode_state(tables):
    data = {}
    for table, mapping in TABLE_FIELDS.items():
        data[table] = [{field: row[column] for field, column in mapping.items()}
                       for row in sorted(tables.get(table, []), key=lambda r: (r.get('sort_order', 0), str(r.get('id', ''))))]
    for company in data['companies']:
        company['ruc'] = company['ruc'] or ''
    for product in data['products']:
        product['active'] = bool(product['active'])
    for task in data['tasks']:
        task['done'] = bool(task['done'])
    for deal in data['deals']:
        deal['prospectIds'] = [p['id'] for p in data['prospects'] if p['dealId'] == deal['id']]
    for quote in data['quotes']:
        items = sorted((r for r in tables.get('quote_items', []) if r['quote_id'] == quote['id']), key=lambda r: r['line_number'])
        if len(items) != 1:
            raise ValueError('La interfaz actual requiere una partida por versión de cotización.')
        item = items[0]
        quote.update(productName=item['product_name'], unitPrice=item['unit_price'], quantity=item['quantity'])
        if item.get('product_id'):
            quote['productId'] = item['product_id']
    return data


def row_key(table, row):
    return (row['quote_id'], row['line_number']) if table == 'quote_items' else row['id']


def changes_between(before, after, workspace):
    old, new = encode_state(before, workspace), encode_state(after, workspace)
    changes = []
    for table in WRITE_ORDER:
        previous = {row_key(table, row): row for row in old[table]}
        current = {row_key(table, row): row for row in new[table]}
        if previous.keys() - current.keys():
            raise ValueError('Esta entrega no permite eliminar registros comerciales.')
        for key, row in current.items():
            if previous.get(key) != row:
                if key in previous and table in ['quotes', 'quote_items', 'activities']:
                    raise ValueError('Las propuestas y actividades históricas son inmutables.')
                changes.append({'table': table, 'row': row, 'insert': key not in previous})
    return changes


def stage_events(before, after, workspace, request_id, actor_id, actor_label):
    previous = {d['id']: d for d in before['deals']}
    return [dict(workspace_id=workspace,
                 id=str(uuid5(NAMESPACE_URL, f'licihub:{workspace}:{request_id}:{d["id"]}:stage')),
                 deal_id=d['id'], from_stage=previous.get(d['id'], {}).get('stage'), to_stage=d['stage'],
                 reason=d['lossReason'], actor_user_id=actor_id, actor_label=actor_label,
                 created_at=d['updatedAt']) for d in after['deals']
            if previous.get(d['id'], {}).get('stage') != d['stage']]


def receipt_added(before, after):
    previous = {r['id'] for r in before['receipts']}
    receipts = [r for r in after['receipts'] if r['id'] not in previous]
    if len(receipts) != 1:
        raise ValueError('Cada escritura debe corresponder a una operación identificada.')
    return deepcopy(receipts[0])
