import unittest

from backend.domain import apply_command, empty_state


class AddContactTests(unittest.TestCase):
    def setUp(self):
        self.state = empty_state()
        self.cmd('intake', dict(company='Empresa Sin Contacto', ruc='20123456780', origin='Manual', kind='quote', service='ISO 9001'))
        self.deal = self.state['deals'][0]

    def cmd(self, operation, payload):
        self.state = apply_command(self.state, operation, payload, 'Asesor de prueba', str(len(self.state['receipts'])))
        if self.state['deals']:
            self.deal = self.state['deals'][0]

    def test_contact_is_created_in_the_deal_company_and_linked_to_the_deal(self):
        self.assertIsNone(self.deal['contactId'])
        self.cmd('contact', dict(dealId=self.deal['id'], name='Ana Compras', email='ana@example.com', phone='+51 999 111 222'))
        contact = self.state['contacts'][0]
        self.assertEqual(contact['companyId'], self.deal['companyId'])
        self.assertEqual(self.deal['contactId'], contact['id'])
        self.assertEqual((contact['name'], contact['email'], contact['phone']), ('Ana Compras', 'ana@example.com', '+51 999 111 222'))
        self.assertEqual(self.state['activities'][-1]['text'], 'Contacto agregado: Ana Compras')

    def test_same_email_in_the_company_is_reused_not_duplicated(self):
        self.cmd('contact', dict(dealId=self.deal['id'], name='Ana Compras', email='ana@example.com'))
        self.cmd('contact', dict(dealId=self.deal['id'], name='Ana (otra grafía)', email='ANA@example.com'))
        self.assertEqual(len(self.state['contacts']), 1)

    def test_a_second_person_does_not_replace_the_deal_contact(self):
        self.cmd('contact', dict(dealId=self.deal['id'], name='Ana Compras'))
        first = self.deal['contactId']
        self.cmd('contact', dict(dealId=self.deal['id'], name='Bruno Gerencia', email='bruno@example.com'))
        self.assertEqual(len(self.state['contacts']), 2)
        self.assertEqual(self.deal['contactId'], first)

    def test_invalid_data_and_unknown_deal_are_rejected(self):
        with self.assertRaises(ValueError):
            self.cmd('contact', dict(dealId=self.deal['id'], name='A'))
        with self.assertRaises(ValueError):
            self.cmd('contact', dict(dealId=self.deal['id'], name='Ana Compras', email='no-es-correo'))
        with self.assertRaisesRegex(ValueError, 'ya no está disponible'):
            self.cmd('contact', dict(dealId='no-existe', name='Ana Compras'))


if __name__ == '__main__':
    unittest.main()


class DealDetailsTest(unittest.TestCase):
    def setUp(self):
        self.state = empty_state()
        self.cmd('intake', dict(company='Detalle SAC', kind='quote', service='ISO 9001'))

    def cmd(self, operation, payload):
        self.state = apply_command(self.state, operation, payload, 'Ana', str(len(self.state['receipts'])))

    @property
    def deal(self):
        return self.state['deals'][0]

    def details(self, **payload):
        self.cmd('deal_details', dict(dealId=self.deal['id'], **payload))

    def test_new_deal_is_normal_without_close_date(self):
        self.assertEqual((self.deal['priority'], self.deal['expectedClose']), ('normal', None))

    def test_sets_priority_and_close_date_and_logs_it(self):
        self.details(priority='high', expectedClose='2026-12-30')
        self.assertEqual((self.deal['priority'], self.deal['expectedClose']), ('high', '2026-12-30'))
        self.assertIn('prioridad Alta', self.state['activities'][-1]['text'])

    def test_unchanged_values_do_not_log(self):
        count = len(self.state['activities'])
        self.details(priority='normal')
        self.assertEqual(len(self.state['activities']), count)

    def test_rejects_invalid_priority_date_and_unknown_deal(self):
        for payload in [dict(dealId=self.deal['id'], priority='urgent'), dict(dealId=self.deal['id'], expectedClose='mañana'), dict(dealId='x', priority='high')]:
            with self.assertRaises(Exception):
                self.cmd('deal_details', payload)


class ContactRecordTests(unittest.TestCase):
    def setUp(self):
        self.state = empty_state()
        self.cmd('intake', dict(company='Ficha SAC', ruc='20123456781', kind='quote', service='ISO 9001', contact='Base Uno', email='base@example.com'))
        self.company = self.state['companies'][0]

    def cmd(self, operation, payload):
        self.state = apply_command(self.state, operation, payload, 'Ana', str(len(self.state['receipts'])))

    def test_creates_a_contact_in_the_company_without_a_deal(self):
        self.cmd('contact_create', dict(companyId=self.company['id'], name='Nueva Persona', email='nueva@example.com', phone='+51 999 888 777'))
        person = self.state['contacts'][-1]
        self.assertEqual((person['companyId'], person['name'], person['email']), (self.company['id'], 'Nueva Persona', 'nueva@example.com'))
        self.assertEqual(len(self.state['deals']), 1)

    def test_rejects_duplicate_email_in_the_same_company_ignoring_case(self):
        with self.assertRaisesRegex(ValueError, 'Ya existe'):
            self.cmd('contact_create', dict(companyId=self.company['id'], name='Otra Persona', email='BASE@example.com'))

    def test_edits_name_email_and_phone(self):
        person = self.state['contacts'][0]
        self.cmd('contact_edit', dict(contactId=person['id'], name='Base Editado', email='editado@example.com', phone='987654321'))
        person = self.state['contacts'][0]
        self.assertEqual((person['name'], person['email'], person['phone']), ('Base Editado', 'editado@example.com', '987654321'))

    def test_edit_keeps_own_email_but_rejects_a_colleagues(self):
        self.cmd('contact_create', dict(companyId=self.company['id'], name='Colega', email='colega@example.com'))
        first, colleague = self.state['contacts']
        self.cmd('contact_edit', dict(contactId=first['id'], name='Base Uno', email='base@example.com', phone=''))
        with self.assertRaisesRegex(ValueError, 'Ya existe'):
            self.cmd('contact_edit', dict(contactId=colleague['id'], name='Colega', email='base@example.com'))

    def test_rejects_unknown_company_and_invalid_data(self):
        for operation, payload in [('contact_create', dict(companyId='x', name='Persona')), ('contact_create', dict(companyId=self.company['id'], name='P')),
                                   ('contact_edit', dict(contactId='x', name='Persona')), ('contact_create', dict(companyId=self.company['id'], name='Persona', phone='abc'))]:
            with self.assertRaises(Exception):
                self.cmd(operation, payload)
