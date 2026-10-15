import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from backend.main import create_app, Settings
from backend.domain import empty_state
from backend.repository import LocalRepository


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = LocalRepository(Path(self.tmp.name) / 'test.json', empty_state())
        self.client = TestClient(create_app(Settings(mode='demo'), self.repo))
        self.client.headers['Origin'] = 'http://127.0.0.1:5174'

    def tearDown(self):
        self.client.close()
        self.tmp.cleanup()

    def command(self, revision=0, request_id='one'):
        return self.client.post('/api/crm/commands', json={'revision': revision, 'requestId': request_id, 'operation': 'intake',
                              'payload': {'company': 'Empresa API', 'service': 'ISO 9001', 'kind': 'quote'}})

    def test_persistence_and_conflict(self):
        self.assertEqual(self.command().status_code, 200)
        self.assertEqual(self.command(request_id='two').status_code, 409)
        state = self.client.get('/api/crm/state').json()
        self.assertEqual(len(state['data']['deals']), 1)
        self.assertEqual(state['revision'], 1)
        self.assertEqual(self.command().status_code, 200)  # Same intent, safe retry after lost response.

    def test_disallows_foreign_origin(self):
        self.client.headers['Origin'] = 'https://other.example'
        self.assertEqual(self.command().status_code, 403)

    def test_bad_data_is_rejected_without_mutation(self):
        response = self.client.post('/api/crm/commands', json={'revision': 0, 'requestId': 'bad', 'operation': 'product', 'payload': {'name': 'ISO', 'price': '-1'}})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get('/api/crm/state').json()['revision'], 0)

    def test_ingestion_disabled_without_key(self):
        response = self.client.post('/api/crm/events', json={'requestId': 'event', 'payload': {}})
        self.assertEqual(response.status_code, 503)

    def test_supabase_mode_fails_closed_without_credentials(self):
        with self.assertRaises(ValueError):
            create_app(Settings(mode='supabase'))


if __name__ == '__main__':
    unittest.main()
