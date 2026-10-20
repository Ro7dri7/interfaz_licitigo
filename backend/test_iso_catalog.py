import unittest

from backend.domain import apply_command, empty_state
from backend.iso_catalog import catalog, eligible_iso


class IsoCatalogTests(unittest.TestCase):
    def test_filter_excludes_courses_implementation_and_non_iso_products(self):
        for name in ['ISO 9001:2015 - Certificación Inicial Micro Empresa (Virtual)',
                     'Pack de 2 ISOS 9001 + 14001 - Recertificación', 'ISO/IEC 29119 - Seguimiento Anual 1']:
            self.assertTrue(eligible_iso(name))
        for name in ['ISO 9001 - Curso auditor líder', 'ISO 45001 - Implementación',
                     'HACCP - Certificación Inicial', 'PESV - Paquete Básico', 'ISO 14001 - Cambio de Dirección']:
            self.assertFalse(eligible_iso(name))

    def test_import_preserves_source_prices_and_is_repeatable_without_overwriting(self):
        state = apply_command(empty_state(), 'import_iso', {}, 'Administrador', 'import-one')
        self.assertEqual(len(state['products']), 540)
        self.assertEqual(sum(p['isPackage'] for p in catalog()), 165)
        sample = next(p for p in state['products'] if p['name'] == 'ISO 9001:2015 - Certificacion Inicial Micro Empresa (Virtual)')
        self.assertEqual(sample['price'], 444000)
        sample['price'] = 12345
        repeated = apply_command(state, 'import_iso', {}, 'Administrador', 'import-two')
        self.assertEqual(len(repeated['products']), 540)
        self.assertEqual(next(p for p in repeated['products'] if p['id'] == sample['id'])['price'], 12345)
