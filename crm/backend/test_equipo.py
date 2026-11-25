import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from backend.domain import empty_state
from backend.main import Settings, create_app
from backend.relational import RelationalRepository


def _config():
    return Settings(_env_file=None, mode='supabase', origin='https://crm.example.com',
                    supabase_url='https://project.example.com', supabase_secret_key='test-only',
                    workspace_id='workspace-test')


class EquipoAdminTests(unittest.TestCase):
    def setUp(self):
        self.tmp = __import__('tempfile').TemporaryDirectory()
        self.repo = RelationalRepository(__import__('pathlib').Path(self.tmp.name) / 'equipo.sqlite3', empty_state())
        self.config = _config()
        self.client = TestClient(create_app(self.config, self.repo), base_url=self.config.origin)
        self.client.headers['Origin'] = self.config.origin
        self.client.cookies.set('lici_crm_session', 'test-token')
        self.user = unittest.mock.Mock(status_code=200)
        self.user.json.return_value = {'id': 'test-user-1'}

    def tearDown(self):
        self.client.close()
        self.tmp.cleanup()

    def _sesion(self, role):
        self.repo.member = AsyncMock(return_value={'display_name': 'Ana Admin', 'role': role})
        cliente = patch('backend.main.httpx.AsyncClient')
        self.addCleanup(cliente.stop)
        mock_client = cliente.start()
        mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=self.user)

    def test_comercial_recibe_403(self):
        self._sesion('commercial')
        response = self.client.get('/api/crm/team')
        self.assertEqual(response.status_code, 403)

    def test_el_unico_admin_no_puede_quitarse_el_acceso(self):
        self._sesion('admin')
        self.repo.equipo = AsyncMock(return_value=[
            {'usuarioId': 'test-user-1', 'nombre': 'Ana Admin', 'correo': 'ana@empresa.pe', 'rol': 'admin', 'activo': True},
        ])
        self.repo.guardar_miembro = AsyncMock()
        response = self.client.post('/api/crm/team/acceso', json={'usuarioId': 'test-user-1', 'rol': 'admin', 'activo': False})
        self.assertEqual(response.status_code, 409)
        self.repo.guardar_miembro.assert_not_awaited()

    def test_admin_cambia_el_rol_de_otro_miembro(self):
        self._sesion('admin')
        miembros = [
            {'usuarioId': 'test-user-1', 'nombre': 'Ana Admin', 'correo': 'ana@empresa.pe', 'rol': 'admin', 'activo': True},
            {'usuarioId': 'comercial-1', 'nombre': 'Luis Ventas', 'correo': 'luis@empresa.pe', 'rol': 'commercial', 'activo': True},
        ]
        self.repo.equipo = AsyncMock(return_value=miembros)
        self.repo.guardar_miembro = AsyncMock()
        response = self.client.post('/api/crm/team/acceso', json={'usuarioId': 'comercial-1', 'rol': 'admin', 'activo': True})
        self.assertEqual(response.status_code, 200)
        self.repo.guardar_miembro.assert_awaited_with('comercial-1', 'Luis Ventas', 'admin', True)

    def test_alta_rechaza_una_clave_debil(self):
        self._sesion('admin')
        response = self.client.post('/api/crm/team', json={
            'email': 'nuevo@empresa.pe', 'rol': 'commercial', 'nombre': 'Luis Ventas', 'password': 'secreta123',
        })
        self.assertEqual(response.status_code, 422)


class ResponsableTests(unittest.TestCase):
    def test_reasigna_el_responsable_del_negocio(self):
        import tempfile
        from pathlib import Path
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        repo = RelationalRepository(Path(tmp.name) / 'owner.sqlite3', empty_state())
        client = TestClient(create_app(Settings(_env_file=None, mode='demo'), repo))
        client.headers['Origin'] = 'http://127.0.0.1:5174'
        created = client.post('/api/crm/commands', json={
            'revision': 0, 'requestId': 'alta', 'operation': 'intake',
            'payload': {'company': 'Empresa Dueño', 'service': 'ISO 9001', 'kind': 'quote', 'owner': 'Sin asignar'},
        })
        self.assertEqual(created.status_code, 200)
        deal = created.json()['data']['deals'][0]
        moved = client.post('/api/crm/commands', json={
            'revision': 1, 'requestId': 'reasigna', 'operation': 'assign_owner',
            'payload': {'dealId': deal['id'], 'owner': 'Ana Admin'},
        })
        self.assertEqual(moved.status_code, 200)
        self.assertEqual(moved.json()['data']['deals'][0]['owner'], 'Ana Admin')
