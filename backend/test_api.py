import tempfile
import json
import unittest
from unittest.mock import AsyncMock, patch
from pathlib import Path
from fastapi.testclient import TestClient
from backend.main import create_app, Settings, Login
from backend.domain import empty_state
from backend.relational import RelationalRepository


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = RelationalRepository(Path(self.tmp.name) / 'test.sqlite3', empty_state())
        self.client = TestClient(create_app(Settings(_env_file=None, mode='demo'), self.repo))
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
            create_app(Settings(_env_file=None, mode='supabase'))

    def test_password_whitespace_is_preserved(self):
        self.assertEqual(Login(email='test@example.com', password=' pass word ').password, ' pass word ')

    def test_restart_preserves_saved_state(self):
        self.command()
        repo = RelationalRepository(self.repo.path, empty_state())
        with TestClient(create_app(Settings(_env_file=None, mode='demo'), repo)) as client:
            self.assertEqual(len(client.get('/api/crm/state').json()['data']['deals']), 1)

    def test_legacy_json_configuration_imports_into_sqlite_and_keeps_original(self):
        legacy = Path(self.tmp.name) / 'previous-demo.json'
        original = json.dumps({'revision': 4, 'data': empty_state()}).encode()
        legacy.write_bytes(original)
        config = Settings(_env_file=None, mode='demo', data_file=legacy)
        with TestClient(create_app(config)) as client:
            self.assertEqual(client.get('/api/crm/state').json()['revision'], 4)
            response = client.post('/api/crm/commands', headers={'Origin': config.origin}, json={
                'revision': 4, 'requestId': 'migrated-command', 'operation': 'intake',
                'payload': {'company': 'Empresa importada', 'service': 'ISO 9001', 'kind': 'quote'}})
            self.assertEqual(response.status_code, 200)
        with TestClient(create_app(config)) as client:
            self.assertEqual(client.get('/api/crm/state').json()['revision'], 5)
        self.assertTrue(legacy.with_suffix('.sqlite3').exists())
        self.assertEqual(legacy.read_bytes(), original)

    def test_ingestion_authentication_and_replay(self):
        event = {'requestId': 'lici-test', 'payload': {'company': 'Evento Lici', 'service': 'ISO 9001', 'origin': 'Lici', 'kind': 'advice'}}
        with TestClient(create_app(Settings(_env_file=None, mode='demo', ingest_key='test-key'), self.repo)) as client:
            self.assertEqual(client.post('/api/crm/events', json=event).status_code, 401)
            first = client.post('/api/crm/events', json=event, headers={'x-crm-ingest-key': 'test-key'})
            self.assertEqual(first.json(), {'accepted': True, 'duplicate': False})
            second = client.post('/api/crm/events', json=event, headers={'x-crm-ingest-key': 'test-key'})
            self.assertEqual(second.json(), {'accepted': True, 'duplicate': True})
            self.assertEqual(len(client.get('/api/crm/state').json()['data']['deals']), 1)

    def test_demo_refuses_remote_clients_and_oversized_writes(self):
        with TestClient(create_app(Settings(_env_file=None, mode='demo'), self.repo), client=('198.51.100.5', 4000)) as client:
            self.assertEqual(client.get('/api/crm/state').status_code, 403)
        self.assertEqual(self.client.post('/api/crm/commands', content='a' * 65537).status_code, 413)

    def test_production_requires_session_and_active_membership_and_catalog_role(self):
        config = Settings(_env_file=None, mode='supabase', origin='https://crm.example.com', supabase_url='https://project.example.com', supabase_secret_key='test-only', workspace_id='workspace-test')
        self.repo.member = AsyncMock(return_value=None)
        with TestClient(create_app(config, self.repo), base_url=config.origin) as client:
            self.assertEqual(client.get('/api/crm/state').status_code, 401)
            client.cookies.set('lici_crm_session', 'test-token')
            response = unittest.mock.Mock(status_code=200)
            response.json.return_value = {'id': 'test-user'}
            with patch('backend.main.httpx.AsyncClient') as mock_client:
                mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=response)
                self.assertEqual(client.get('/api/crm/state').status_code, 403)
                self.repo.member.return_value = {'display_name': 'Asesor', 'role': 'commercial'}
                self.assertEqual(client.get('/api/crm/state').status_code, 200)
                result = client.post('/api/crm/commands', headers={'Origin': config.origin}, json={'revision': 0, 'requestId': 'denied', 'operation': 'product', 'payload': {'name': 'ISO', 'price': 100}})
                self.assertEqual(result.status_code, 403)
                denied_import = client.post('/api/crm/commands', headers={'Origin': config.origin}, json={
                    'revision': 0, 'requestId': 'denied-iso', 'operation': 'import_iso', 'payload': {}})
                self.assertEqual(denied_import.status_code, 403)
                self.assertEqual(client.get('/api/crm/state').json()['revision'], 0)


if __name__ == '__main__':
    unittest.main()
