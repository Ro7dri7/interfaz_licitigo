import unittest

from backend.domain import apply_command, empty_state
from backend.iso_catalog import catalog, eligible_iso


class IsoCatalogTests(unittest.TestCase):
    def test_filter_excludes_courses_implementation_and_non_iso_products(self):
        for name in ['ISO 9001:2015 - Certificación Inicial Micro Empresa (Virtual)',
                     'Pack de 2 ISOS 9001 + 14001 - Recertificación', 'ISO/IEC 29119 - Seguimiento Anual 1']:
            self.assertTrue(eligible_iso(name))
        for name in ['ISO 9001 - Curso auditor líder', 'ISO 45001 - Implementación',
                     'HACCP - Certificación Inicial', 'PESV - Paquete Básico', 'ISO 14001 - Cambio de Dirección',
                     'ISO 9001 - Certificación Inicial + Curso de auditor líder',
                     'Pack de 2 ISOS - Certificación Inicial y Capacitación',
                     'ISO 9001 - Recertificación con formación de auditores']:
            self.assertFalse(eligible_iso(name))

    def test_manual_products_preserve_inactive_state_and_cents(self):
        state = apply_command(empty_state(), 'product', {
            'name': 'ISO 9001 - Certificación Inicial Micro Empresa (Virtual)',
            'price': '4440.25', 'active': False}, 'Administrador', 'manual-product')
        self.assertEqual(state['products'][0]['price'], 444025)
        self.assertEqual(state['products'][0]['currency'], 'PEN')
        self.assertFalse(state['products'][0]['active'])

    def test_manual_products_do_not_admit_courses_disguised_as_iso_certifications(self):
        for name in ['ISO 9001 - Curso de auditor líder', 'ISO 9001 - Certificación Inicial con curso']:
            with self.assertRaisesRegex(ValueError, 'cursos'):
                apply_command(empty_state(), 'product', {'name': name, 'price': '100'}, 'Administrador', 'course')

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
