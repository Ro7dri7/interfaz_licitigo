"""Catálogo autorizado: certificación, recertificación y seguimiento ISO del Excel entregado."""
import json
from pathlib import Path
import re
import unicodedata
from functools import cache

SOURCE = 'hubspot-crm-exports-todos-productos-2026-09-23.xlsx'


def normalized(value):
    return ''.join(c for c in unicodedata.normalize('NFD', value) if unicodedata.category(c) != 'Mn').lower()


def is_training(name):
    return bool(re.search(r'\b(cursos?|capacitacion(?:es)?|formacion|diplomados?|taller(?:es)?|examen(?:es)?)\b', normalized(name)))


def eligible_iso(name):
    text = normalized(name.strip())
    excluded = is_training(name) or re.search(r'\b(implementacion|auditoria interna)\b', text)
    return not excluded and bool(re.match(r'^(iso\b|pack de \d+ isos\b)', text)) and any(
        category in text for category in ['certificacion inicial', 'recertificacion', 'seguimiento anual'])


@cache
def catalog():
    return json.loads((Path(__file__).parent / 'catalogo_iso.json').read_text(encoding='utf-8'))


def import_catalog(state):
    known = {product['id'] for product in state['products']}
    added = 0
    for product in catalog():
        if product['id'] not in known:
            state['products'].append({key: product[key] for key in ['id', 'name', 'price']} | {'currency': 'PEN', 'active': True})
            added += 1
    return added


@cache
def catalog_index():
    return {p['id']: p for p in catalog()}


def metadata(product_id):
    return catalog_index().get(product_id)
