import unittest
from copy import deepcopy

from backend.domain import apply_command, empty_state


class CommercialFlowTests(unittest.TestCase):
    def setUp(self):
        self.state = empty_state()

    def run_command(self, operation, payload, request_id=None):
        self.state = apply_command(self.state, operation, payload, 'Asesor de prueba', request_id or str(len(self.state['receipts'])))

    def intake(self, kind='signal', **changes):
        return dict(company='Empresa Ejemplo', ruc='20123456789', contact='Ana', email='ana@example.com',
                    origin='Lici', kind=kind, service='ISO 9001', evidence='required', tender='LP-001', **changes)

    def test_signal_never_creates_deal_but_request_preserves_context(self):
        self.run_command('intake', self.intake())
        self.assertEqual(len(self.state['deals']), 0)
        self.run_command('intake', self.intake('quote'))
        self.assertEqual(len(self.state['companies']), 1)
        self.assertEqual(len(self.state['contacts']), 1)
        self.assertEqual(len(self.state['deals']), 1)
        self.assertEqual(self.state['prospects'][0]['kind'], 'signal')
        self.assertEqual(self.state['deals'][0]['stage'], 'new')
        self.assertEqual(len(self.state['deals'][0]['prospectIds']), 2)

    def test_duplicate_delivery_is_idempotent_and_changed_payload_conflicts(self):
        payload = self.intake('quote')
        self.run_command('intake', payload, 'event-1')
        before = deepcopy(self.state)
        self.run_command('intake', payload, 'event-1')
        self.assertEqual(self.state, before)
        with self.assertRaisesRegex(ValueError, 'identificador'):
            self.run_command('intake', self.intake('advice'), 'event-1')

    def test_repeated_request_reuses_open_deal_but_new_need_creates_another(self):
        self.run_command('intake', self.intake('quote'))
        self.run_command('intake', self.intake('advice'))
        other = self.intake('quote')
        other['service'] = 'ISO 14001'
        self.run_command('intake', other)
        self.assertEqual(len(self.state['deals']), 2)

    def test_lost_deal_requires_reason_and_does_not_mutate_on_error(self):
        self.run_command('intake', self.intake('quote'))
        before = deepcopy(self.state)
        with self.assertRaisesRegex(ValueError, 'motivo'):
            self.run_command('stage', {'dealId': self.state['deals'][0]['id'], 'stage': 'lost'})
        self.assertEqual(self.state, before)

    def test_quote_freezes_price_and_uses_integer_cents(self):
        self.run_command('intake', self.intake('quote'))
        self.run_command('product', {'name': 'ISO 9001', 'price': '100.05'})
        product = self.state['products'][0]
        self.run_command('quote', {'dealId': self.state['deals'][0]['id'], 'productId': product['id'],
                                  'quantity': 3, 'discount': '10', 'tax': '18', 'validUntil': '2026-12-31'})
        quote = self.state['quotes'][0]
        self.assertEqual(quote['subtotal'], 30015)
        self.assertEqual(quote['discountAmount'], 3002)
        self.assertEqual(quote['total'], 31875)
        self.state['products'][0]['price'] = 999999
        self.assertEqual(quote['unitPrice'], 10005)
        self.run_command('quote', {'dealId': self.state['deals'][0]['id'], 'productId': product['id'],
                                  'quantity': 1, 'validUntil': '2026-12-31'})
        self.assertEqual(self.state['quotes'][0]['total'], 31875)
        self.assertEqual(self.state['quotes'][1]['version'], 2)
        self.assertEqual(self.state['quotes'][1]['unitPrice'], 999999)

    def test_task_completion_is_idempotent(self):
        self.run_command('intake', self.intake('advice'))
        task = self.state['tasks'][0]
        self.run_command('complete_task', {'taskId': task['id']})
        count = len(self.state['activities'])
        self.run_command('complete_task', {'taskId': task['id']})
        self.assertEqual(len(self.state['activities']), count)

    def test_shared_phone_does_not_merge_distinct_contacts(self):
        a = self.intake()
        a['phone'] = '+51999999999'
        self.run_command('intake', a)
        a['contact'] = 'Otro contacto'
        a['email'] = 'otra@example.com'
        self.run_command('intake', a)
        self.assertEqual(len(self.state['contacts']), 2)

    def test_signal_after_request_links_context_without_opening_another_deal(self):
        self.run_command('intake', self.intake('quote'))
        self.run_command('intake', self.intake('signal'))
        self.assertEqual(len(self.state['deals']), 1)
        self.assertEqual(self.state['prospects'][1]['dealId'], self.state['deals'][0]['id'])
        self.assertEqual(len(self.state['deals'][0]['prospectIds']), 2)

    def test_converting_associated_prospect_cannot_create_orphan_deal_after_closure(self):
        self.run_command('intake', self.intake('quote'))
        self.run_command('stage', {'dealId': self.state['deals'][0]['id'], 'stage': 'lost', 'reason': 'Sin presupuesto'})
        before = deepcopy(self.state)
        with self.assertRaisesRegex(ValueError, 'asociado'):
            self.run_command('convert', {'prospectId': self.state['prospects'][0]['id']})
        self.assertEqual(before, self.state)

    def test_task_offsets_are_normalized_for_chronological_sorting(self):
        self.run_command('intake', self.intake('advice'))
        self.run_command('task', {'dealId': self.state['deals'][0]['id'], 'title': 'Llamar', 'dueAt': '2026-12-01T09:00:00-05:00'})
        self.assertEqual(self.state['tasks'][-1]['dueAt'], '2026-12-01T14:00:00+00:00')


if __name__ == '__main__':
    unittest.main()
