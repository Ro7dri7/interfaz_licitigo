import unittest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient
from app.auth import Usuario, usuario_actual
from app.config import Settings

with patch('app.config.get_settings', return_value=Settings(_env_file=None, supabase_url='https://supabase.example',
        supabase_secret_key='test-only', apimigo_token='test-only')):
    from app.main import app


class AsesoriaApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.addCleanup(app.dependency_overrides.clear)
        self.body = {'solicitudId': str(uuid4()), 'licitacionId': 12}

    def test_requires_portal_session(self):
        self.assertEqual(self.client.post('/api/asesorias', json=self.body).status_code, 401)

    def test_uses_authenticated_identity_and_rejects_spoofed_fields(self):
        app.dependency_overrides[usuario_actual] = lambda: Usuario('profile-auth', 'ana@example.com', 'Ana')
        with patch('app.main.asesorias.preparar', new=AsyncMock(return_value={'origin': 'Lici'})) as prepare, \
                patch('app.main.asesorias.solicitar', new=AsyncMock(return_value={'estado':'pendiente'})) as send:
            self.assertEqual(self.client.post('/api/asesorias', json=self.body).status_code, 200)
            prepare.assert_awaited_once_with('profile-auth', 'ana@example.com', 'Lici', licitacion_id=12)
            self.assertEqual(send.await_args.args[0], f'web:profile-auth:{self.body["solicitudId"]}')
            self.assertEqual(self.client.post('/api/asesorias', json=self.body | {'perfil_id':'victim'}).status_code, 422)


if __name__ == '__main__':
    unittest.main()
