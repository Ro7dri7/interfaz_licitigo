import asyncio
from contextlib import closing
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi.testclient import TestClient

from backend.domain import apply_command, empty_state, hide_admin_data
from backend.main import Settings, create_app
from backend.relational import RelationalRepository
from backend.relational_codec import decode_state, encode_state
from backend.seed import demo_state


class CustomPropertyTests(unittest.TestCase):
    def setUp(self):
        self.n = 0
        self.state = self.run_command('intake', dict(company='Acme', ruc='20111111111', service='ISO 9001', kind='quote', contact='Ana'))
        self.company, self.contact, self.deal = (self.state[k][0] for k in ['companies', 'contacts', 'deals'])

    def run_command(self, operation, payload, state=None):
        self.n += 1
        return apply_command(state or getattr(self, 'state', empty_state()), operation, payload, 'Admin', f'r{self.n}')

    def create(self, **payload):
        self.state = self.run_command('property_create', {'entity': 'company', 'name': 'Sector', 'type': 'select', 'options': ['Minería', 'Servicios'], **payload}, self.state)
        return self.state['properties'][-1]

    def test_creates_properties_with_clean_options_and_rejects_duplicates(self):
        prop = self.create(options=['  Minería ', 'minería', 'Servicios'])
        self.assertEqual(prop['options'], ['Minería', 'Servicios'])
        self.assertTrue(prop['active'])
        with self.assertRaisesRegex(ValueError, 'Ya existe'):
            self.create(name='sector')
        with self.assertRaisesRegex(ValueError, 'al menos una opción'):
            self.create(name='Tamaño', options=[])
        self.assertEqual(self.create(name='Cargo', entity='contact', type='text', options=['ignorada'])['options'], [])

    def test_sets_validates_and_clears_values_by_type(self):
        sector = self.create()
        number = self.create(name='Empleados', type='number', options=[])
        when = self.create(name='Renovación', entity='deal', type='date', options=[])
        put = lambda prop, record, value: self.run_command('property_set', dict(propertyId=prop['id'], recordId=record['id'], value=value), self.state)
        self.state = put(sector, self.company, 'Minería')
        self.state = put(number, self.company, '12,50')
        self.state = put(when, self.deal, '2026-12-31')
        self.assertEqual(self.state['companies'][0]['props'], {sector['id']: 'Minería', number['id']: '12.5'})
        self.assertEqual(self.state['deals'][0]['props'], {when['id']: '2026-12-31'})
        for prop, record, value in [(sector, self.company, 'Pesca'), (number, self.company, 'mucho'), (when, self.deal, '31/12/2026')]:
            with self.assertRaises(ValueError):
                put(prop, record, value)
        self.state = put(sector, self.company, '')
        self.assertEqual(self.state['companies'][0]['props'], {number['id']: '12.5'})

    def test_archived_property_keeps_values_but_cannot_be_edited(self):
        sector = self.create()
        self.state = self.run_command('property_set', dict(propertyId=sector['id'], recordId=self.company['id'], value='Minería'), self.state)
        self.state = self.run_command('property_archive', dict(propertyId=sector['id'], active=False), self.state)
        self.assertEqual(self.state['companies'][0]['props'][sector['id']], 'Minería')
        with self.assertRaisesRegex(ValueError, 'archivada'):
            self.run_command('property_set', dict(propertyId=sector['id'], recordId=self.company['id'], value='Servicios'), self.state)

    def test_hide_admin_data_removes_definitions_and_values(self):
        sector = self.create()
        self.state = self.run_command('property_set', dict(propertyId=sector['id'], recordId=self.company['id'], value='Minería'), self.state)
        visible = hide_admin_data(self.state)
        self.assertEqual(visible['properties'], [])
        self.assertNotIn('props', visible['companies'][0])
        self.assertIn('props', self.state['companies'][0])  # el original no se altera

    def test_codec_round_trips_and_tolerates_a_database_without_migration_010(self):
        sector = self.create()
        self.state = self.run_command('property_set', dict(propertyId=sector['id'], recordId=self.company['id'], value='Minería'), self.state)
        tables = encode_state(self.state, 'w')
        self.assertEqual(decode_state(tables)['companies'][0]['props'], {sector['id']: 'Minería'})
        self.assertEqual(decode_state(tables)['properties'][0]['options'], ['Minería', 'Servicios'])
        old = {name: [{k: v for k, v in row.items() if k != 'props'} for row in rows] for name, rows in tables.items() if name != 'properties'}
        data = decode_state(old)
        self.assertEqual(data['properties'], [])
        self.assertNotIn('props', data['companies'][0])


class PropertyStorageAndAccessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = RelationalRepository(Path(self.tmp.name) / 'crm.sqlite3', demo_state())
        with closing(sqlite3.connect(self.repo.path)) as db, db:
            db.execute("insert into portal_users(id) values ('user-1')")  # la cuenta simulada del portal

    def tearDown(self):
        self.tmp.cleanup()

    def test_values_and_definitions_survive_a_restart_of_the_sqlite_store(self):
        data = asyncio.run(self.repo.load())['data']
        sector = data['properties'][0]
        self.assertEqual(sector['name'], 'Sector')
        self.assertEqual(sum(1 for c in data['companies'] if sector['id'] in c.get('props', {})), 8)
        again = RelationalRepository(Path(self.tmp.name) / 'crm.sqlite3', demo_state())
        self.assertEqual(asyncio.run(again.load())['data']['companies'][0]['props'], data['companies'][0]['props'])
        before = asyncio.run(again.load())
        updated = apply_command(before['data'], 'property_set', dict(propertyId=sector['id'], recordId=data['companies'][0]['id'], value='Otros'), 'Admin', 'edit-1')
        saved = asyncio.run(again.save(updated, before['revision'], before=before))
        self.assertEqual(saved['data']['companies'][0]['props'][sector['id']], 'Otros')
        self.assertEqual(saved['schemaVersion'], 3)

    def client(self, role):
        config = Settings(_env_file=None, mode='supabase', origin='https://127.0.0.1:5174',
                          supabase_url='https://project.example.com', supabase_secret_key='test-only', workspace_id='test')
        self.repo.member = AsyncMock(return_value={'display_name': 'Persona', 'role': role})
        client = TestClient(create_app(config, self.repo), base_url='https://127.0.0.1:5174')
        client.headers['Origin'] = 'https://127.0.0.1:5174'
        client.cookies.set('lici_crm_session', 'token')
        return client

    def with_auth(self):
        fake = MagicMock()
        fake.__aenter__ = AsyncMock(return_value=fake)
        fake.__aexit__ = AsyncMock(return_value=False)
        fake.get = AsyncMock(return_value=httpx.Response(200, json={'id': 'user-1'}))
        return patch('backend.main.httpx.AsyncClient', return_value=fake)

    def test_only_administrators_see_and_edit_custom_properties(self):
        with self.with_auth():
            with self.client('admin') as admin:
                state = admin.get('/api/crm/state').json()
                self.assertEqual(state['data']['properties'][0]['name'], 'Sector')
                self.assertIn('props', state['data']['companies'][0])
            with self.client('commercial') as commercial:
                state = commercial.get('/api/crm/state').json()
                self.assertEqual(state['data']['properties'], [])
                self.assertNotIn('props', state['data']['companies'][0])
                company = state['data']['companies'][0]['id']
                for operation, payload in [('property_create', dict(entity='deal', name='Canal', type='text')),
                                           ('property_set', dict(propertyId='x', recordId=company, value='Otros'))]:
                    response = commercial.post('/api/crm/commands', json=dict(revision=state['revision'], requestId=f'no-{operation}', operation=operation, payload=payload))
                    self.assertEqual(response.status_code, 403)
                    self.assertIn('administración', response.json()['detail'])
                ok = commercial.post('/api/crm/commands', json=dict(revision=state['revision'], requestId='normal', operation='intake',
                                                                    payload=dict(company='Nueva SAC', service='ISO 9001', kind='quote')))
                self.assertEqual(ok.status_code, 200)
                self.assertEqual(ok.json()['data']['properties'], [])
            with self.client('admin') as admin:  # lo que el comercial hizo no borra los valores del admin
                self.assertEqual(sum(1 for c in admin.get('/api/crm/state').json()['data']['companies'] if c.get('props')), 8)


if __name__ == '__main__':
    unittest.main()
