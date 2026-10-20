"""Extrae únicamente productos ISO autorizados. No modifica el Excel ni Supabase."""
import hashlib
import json
from decimal import Decimal
from pathlib import Path
import sys
from uuid import uuid5, NAMESPACE_URL

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.iso_catalog import SOURCE, eligible_iso, normalized

source = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / SOURCE
book = load_workbook(source, read_only=True, data_only=True)
sheet = book['Todos productos']
sheet.reset_dimensions()  # El export declara A1 aunque contiene cientos de filas.
rows = iter(sheet.values)
headers = next(rows)
assert headers[1] == 'Nombre' and headers[3] == 'Price PEN'
products = []
for source_row, row in enumerate(rows, 2):
    name = str(row[1] or '').strip()
    if not eligible_iso(name) or row[12] != 'Activo':
        continue
    if not isinstance(row[3], (int, float)) or row[3] < 0:
        raise ValueError(f'Precio PEN inválido en la fila {source_row}')
    price = Decimal(str(row[3])) * 100
    if price != price.to_integral_value():
        raise ValueError(f'Precio con más de dos decimales en fila {source_row}')
    text = normalized(name)
    products.append(dict(id=str(uuid5(NAMESPACE_URL, f'licihub:hubspot-product:{row[0]}')),
                         hubspotId=str(row[0]), sku=row[2], name=name, price=int(price), sourceRow=source_row,
                         category='initial' if 'certificacion inicial' in text else 'renewal' if 'recertificacion' in text else 'surveillance',
                         isPackage=text.startswith('pack de ')))
book.close()
if len({p['id'] for p in products}) != len(products):
    raise ValueError('El archivo contiene IDs duplicados; revisar antes de importar.')
target = ROOT / 'backend/catalogo_iso.json'
target.write_text('[\n' + ',\n'.join(json.dumps(p, ensure_ascii=False) for p in products) + '\n]\n', encoding='utf-8')
print(json.dumps({'source': source.name, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                  'selected': len(products), 'packages': sum(p['isPackage'] for p in products), 'output': str(target)}))
