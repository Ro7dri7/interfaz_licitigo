import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from backend.domain import empty_state
from backend.main import Settings, create_app
from backend.relational import RelationalRepository


class TelegramIngestionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = RelationalRepository(Path(self.tmp.name) / 'crm.sqlite3', empty_state())
        self.client = TestClient(create_app(Settings(_env_file=None, mode='demo', ingest_key='test-integration'), self.repo))

    def tearDown(self):
        self.client.close()
        self.tmp.cleanup()

    def send(self, request_id='telegram:1', **changes):
        payload = dict(company='Empresa Telegram', ruc='20123456789', contact='Ana Prueba',
                       email='ana@example.com', service='Asesoría certificaciones ISO', origin='Telegram',
                       kind='advice', notes='Contacto Telegram: @ana_prueba')
        return self.client.post('/api/crm/events', headers={'x-crm-ingest-key': 'test-integration'},
                                json={'requestId': request_id, 'payload': payload | changes})

    def test_telegram_request_persists_and_replay_never_duplicates(self):
        self.assertEqual(self.send().json(), {'accepted': True, 'duplicate': False})
        self.assertEqual(self.send().json(), {'accepted': True, 'duplicate': True})
        data = self.client.get('/api/crm/state').json()['data']
        self.assertEqual(len(data['deals']), 1)
        self.assertEqual(len(data['prospects']), 1)
        self.assertEqual(data['deals'][0]['origin'], 'Telegram')
        self.assertEqual(data['deals'][0]['stage'], 'new')
        self.assertEqual(len(data['tasks']), 1)
        self.assertIn('@ana_prueba', data['prospects'][0]['notes'])

    def test_only_explicit_requests_can_enter_from_integration(self):
        for kind in ['signal', 'manual']:
            self.assertEqual(self.send(kind=kind, origin='Lici').status_code, 422)
        self.assertEqual(self.client.get('/api/crm/state').json()['revision'], 0)

    def test_channels_share_open_need_and_preserve_each_request(self):
        self.assertEqual(self.send('web:1', origin='Lici').status_code, 200)
        self.assertEqual(self.send().status_code, 200)
        data = self.client.get('/api/crm/state').json()['data']
        self.assertEqual(len(data['companies']), 1)
        self.assertEqual(len(data['contacts']), 1)
        self.assertEqual(len(data['deals']), 1)
        self.assertEqual({p['origin'] for p in data['prospects']}, {'Lici', 'Telegram'})


if __name__ == '__main__':
    unittest.main()
