import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from app import asesorias
from app.config import Settings


class AsesoriaTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.config = Settings(_env_file=None, supabase_url='https://supabase.example',
                               supabase_secret_key='test-only', apimigo_token='test-only',
                               crm_api_url='http://127.0.0.1:8001', crm_ingest_key='test-key',
                               crm_outbox_file=Path(self.tmp.name) / 'cola.sqlite3')
        self.settings = patch('app.asesorias.get_settings', return_value=self.config)
        self.settings.start()
        self.addCleanup(self.settings.stop)
        self.addCleanup(self.tmp.cleanup)

    def event(self):
        return dict(company='Empresa de prueba', ruc='20123456789', contact='Ana', email='ana@example.com',
                    origin='Telegram', kind='advice', service='Asesoría certificaciones ISO')

    async def test_queue_survives_restart_and_replays_identical_event_after_timeout(self):
        queue = asesorias.ColaAsesorias(self.config.crm_outbox_file)
        queue.registrar('telegram:1', 'perfil-1', self.event())
        sent = []

        def respond(request):
            sent.append(json.loads(request.content))
            if len(sent) == 1:
                raise httpx.ReadTimeout('test timeout', request=request)
            return httpx.Response(200, json={'accepted': True, 'duplicate': True})

        transport = httpx.MockTransport(respond)
        self.assertEqual(await asesorias.entregar('telegram:1', transport=transport), 'pendiente')
        queue = asesorias.ColaAsesorias(self.config.crm_outbox_file)
        self.assertEqual(queue.obtener('telegram:1')['estado'], 'pendiente')
        self.assertEqual(await asesorias.entregar('telegram:1', transport=transport), 'entregada')
        self.assertEqual(sent[0], sent[1])
        self.assertEqual(await asesorias.entregar('telegram:1', transport=transport), 'entregada')
        self.assertEqual(len(sent), 2)

    async def test_queue_rejects_changed_payload_and_does_not_retry_definitive_error(self):
        queue = asesorias.ColaAsesorias(self.config.crm_outbox_file)
        queue.registrar('telegram:1', 'perfil-1', self.event())
        with self.assertRaises(asesorias.AsesoriaError):
            queue.registrar('telegram:1', 'perfil-1', self.event() | {'service': 'ISO 9001'})
        transport = httpx.MockTransport(lambda _: httpx.Response(401))
        self.assertEqual(await asesorias.entregar('telegram:1', transport=transport), 'error')
        self.assertEqual(queue.pendientes(), [])

    async def test_invalid_success_body_stays_pending(self):
        queue = asesorias.ColaAsesorias(self.config.crm_outbox_file)
        queue.registrar('telegram:1', 'perfil-1', self.event())
        self.assertEqual(await asesorias.entregar('telegram:1', transport=httpx.MockTransport(
            lambda _: httpx.Response(200, json={'accepted': False}))), 'pendiente')

    async def test_disabled_receiver_code_is_preserved_without_private_error_text(self):
        queue=asesorias.ColaAsesorias(self.config.crm_outbox_file)
        queue.registrar('telegram:1','profile',self.event())
        transport=httpx.MockTransport(lambda _:httpx.Response(503,json={
            'code':'crm_ingest_disabled','detail':'private-provider-error'}))
        self.assertEqual(await asesorias.entregar('telegram:1',transport=transport),'pendiente')
        error=queue.obtener('telegram:1')['ultimo_error']
        self.assertIn('crm_ingest_disabled',error)
        self.assertNotIn('private-provider-error',error)

    async def test_diagnostic_sends_invalid_intent_and_never_creates_an_outbox(self):
        sent=[]
        def respond(request):
            sent.append(json.loads(request.content))
            return httpx.Response(422,json={'code':'crm_explicit_request_required'})
        result=await asesorias.diagnostico(transport=httpx.MockTransport(respond))
        self.assertEqual(result['codigo'],'recepcion_habilitada')
        self.assertEqual(sent[0]['payload']['kind'],'diagnostic')
        self.assertFalse(self.config.crm_outbox_file.exists())

    def test_customer_status_is_scoped_to_linked_profile(self):
        queue=asesorias.ColaAsesorias(self.config.crm_outbox_file)
        queue.registrar('telegram:1','profile',self.event())
        queue.actualizar('telegram:1','entregada')
        self.assertIn('recibió',asesorias.estado_de_solicitud('profile'))
        self.assertIn('no tienes solicitudes',asesorias.estado_de_solicitud('other-profile'))
        self.assertEqual(queue.obtener('telegram:1')['evento'],'')

    async def test_unlocked_tender_is_required_and_server_uses_current_profile(self):
        db = AsyncMock()
        db.select.side_effect = [
            [{'id': 'perfil-1', 'ruc_empresa': '20123456789', 'nombre_completo': 'Ana'}],
            [{'razon_social': 'Empresa vigente'}],
            [],
        ]
        with patch('app.asesorias.get_db', return_value=db):
            with self.assertRaises(asesorias.AsesoriaError) as error:
                await asesorias.preparar('perfil-1', 'ana@example.com', 'Lici', licitacion_id=12)
        self.assertEqual(error.exception.status, 403)
        self.assertIn('eq.perfil-1', str(db.select.call_args_list[-1]))

    async def test_disabled_integration_does_not_queue(self):
        self.config.crm_ingest_key = ''
        with self.assertRaises(asesorias.AsesoriaError):
            asesorias.comprobar_configuracion()
        self.assertFalse(self.config.crm_outbox_file.exists())

    def test_http_only_allowed_for_loopback_and_no_credentials_in_url(self):
        for url in ['http://crm.example.com', 'https://user:password@crm.example.com', 'https://crm.example.com?key=secret']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                Settings(_env_file=None, supabase_url='https://supabase.example', supabase_secret_key='test',
                         apimigo_token='test', crm_api_url=url)


if __name__ == '__main__':
    unittest.main()
