from copy import deepcopy
import unittest

from backend.domain import apply_command, empty_state


class MultipleQuoteTests(unittest.TestCase):
    def setUp(self):
        self.state = empty_state()
        self.run_command('intake', {'company': 'Empresa propuesta', 'ruc': '20999900001', 'contact': 'Ana',
                                   'email': 'ana@example.com', 'kind': 'quote', 'service': 'Certificación integrada', 'owner': 'Lucía Mendoza (prueba)'})
        self.run_command('product', {'name': 'ISO 9001', 'price': '100.05'})
        self.run_command('product', {'name': 'Pack ISO 14001 + ISO 45001', 'price': '200.10'})
        self.deal = self.state['deals'][0]['id']

    def run_command(self, operation, payload, request_id=None):
        self.state = apply_command(self.state, operation, payload, 'Asesor', request_id or str(len(self.state['receipts'])))

    def quote(self):
        self.run_command('quote', {'dealId': self.deal, 'items': [
            {'productId': self.state['products'][0]['id'], 'quantity': 3},
            {'productId': self.state['products'][1]['id'], 'quantity': 1}],
            'discount': '10', 'tax': '18', 'validUntil': '2099-12-31', 'terms': 'Pago sujeto a acuerdo comercial.'})
        return self.state['quotes'][-1]

    def test_multiple_lines_freeze_prices_client_and_issuer_and_round_totals(self):
        q = self.quote()
        self.assertEqual(len(q['items']), 2)
        self.assertEqual((q['subtotal'], q['discountAmount'], q['taxAmount'], q['total']), (50025, 5003, 6868, 45022))
        self.assertTrue(q['taxIncluded'])
        self.assertEqual(q['issuerName'], 'INTERCERT LATAM S.A.C.')
        self.assertEqual(q['issuerRuc'], '20612137880')
        self.state['companies'][0]['name'] = 'Nombre cambiado'
        self.state['products'][0]['price'] = 1
        self.assertEqual(q['customerName'], 'Empresa propuesta')
        self.assertEqual(q['items'][0]['unitPrice'], 10005)

    def test_send_accept_is_audited_and_does_not_automatically_close_the_deal(self):
        q = self.quote()
        self.run_command('quote_status', {'quoteId': q['id'], 'status': 'sent', 'recipient': 'ana@example.com',
                                        'channel': 'email', 'note': 'Enviada externamente por correo.'})
        self.assertEqual(self.state['deals'][0]['stage'], 'quoted')
        self.run_command('quote_status', {'quoteId': q['id'], 'status': 'accepted', 'recipient': 'Ana',
                                        'channel': 'email', 'note': 'Confirmación recibida por correo.'}, 'accept')
        accepted = self.state['quotes'][0]
        self.assertEqual(accepted['status'], 'accepted')
        self.assertEqual([event['status'] for event in accepted['events']], ['sent', 'accepted'])
        self.assertEqual(accepted['events'][-1]['actor'], 'Asesor')
        self.assertNotEqual(self.state['deals'][0]['stage'], 'won')
        before = deepcopy(self.state)
        self.run_command('quote_status', {'quoteId': q['id'], 'status': 'accepted', 'recipient': 'Ana',
                                        'channel': 'email', 'note': 'Confirmación recibida por correo.'}, 'accept')
        self.assertEqual(self.state, before)

    def test_acceptance_requires_sent_quote_and_keeps_state_on_failure(self):
        q = self.quote(); before = deepcopy(self.state)
        with self.assertRaises(ValueError):
            self.run_command('quote_status', {'quoteId': q['id'], 'status': 'accepted', 'recipient': 'Ana', 'note': 'Confirmada'})
        self.assertEqual(self.state, before)

    def test_a_new_version_does_not_rewrite_the_first(self):
        self.quote(); first = deepcopy(self.state['quotes'][0])
        self.state['products'][0]['price'] = 12345
        self.quote()
        self.assertEqual(self.state['quotes'][0], first)
        self.assertEqual(self.state['quotes'][1]['version'], 2)

    def test_duplicate_or_inactive_products_are_rejected(self):
        product = self.state['products'][0]['id']
        for lines in [[{'productId': product, 'quantity': 1}] * 2]:
            with self.assertRaises(ValueError):
                self.run_command('quote', {'dealId': self.deal, 'items': lines, 'validUntil': '2099-12-31'})
        self.state['products'][0]['active'] = False
        with self.assertRaises(ValueError):
            self.run_command('quote', {'dealId': self.deal, 'items': [{'productId': product, 'quantity': 1}], 'validUntil': '2099-12-31'})

    def test_rejected_proposal_is_terminal_and_can_be_replaced_by_new_version(self):
        q = self.quote()
        for status in ['sent', 'rejected']:
            self.run_command('quote_status', {'quoteId': q['id'], 'status': status, 'recipient': 'Ana', 'note': 'Registro de prueba.'})
        before = deepcopy(self.state)
        with self.assertRaises(ValueError):
            self.run_command('quote_status', {'quoteId': q['id'], 'status': 'accepted', 'recipient': 'Ana', 'note': 'No permitido.'})
        self.assertEqual(self.state, before)
        self.quote()
        self.assertEqual(self.state['quotes'][1]['version'], 2)
        self.assertEqual(self.state['quotes'][0]['status'], 'rejected')

    def test_expired_quote_cannot_be_sent(self):
        self.run_command('quote', {'dealId': self.deal, 'items': [
            {'productId': self.state['products'][0]['id'], 'quantity': 1}],
            'validUntil': '2000-01-01', 'terms': 'Prueba.'})
        q = self.state['quotes'][0]
        with self.assertRaisesRegex(ValueError, 'venció'):
            self.run_command('quote_status', {'quoteId': q['id'], 'status': 'sent', 'recipient': 'Ana', 'note': 'No permitido.'})
