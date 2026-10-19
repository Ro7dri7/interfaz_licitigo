import asyncio
import json
import unittest
import httpx

from backend.domain import apply_command, empty_state
from backend.relational_codec import encode_state
from backend.repository import SupabaseRepository, Conflict, StorageUnavailable
from backend.sql_names import TABLAS, fila_sql

WORKSPACE = '10000000-0000-0000-0000-000000000001'
ACTOR = {'id': '20000000-0000-0000-0000-000000000001', 'name': 'Asesor', 'role': 'admin'}


class SupabaseAdapterTests(unittest.TestCase):
    def test_uses_service_only_rpcs_and_sends_only_changed_rows(self):
        original = apply_command(empty_state(), 'intake', {'company': 'Empresa', 'service': 'ISO 9001', 'kind': 'quote'}, 'Asesor', 'first')
        before = {'revision': 1, 'data': original}
        updated = apply_command(original, 'complete_task', {'taskId': original['tasks'][0]['id']}, 'Asesor', 'second')
        calls = []
        def respond(request):
            calls.append((request.url.path, json.loads(request.content)))
            return httpx.Response(200, json={'revision': 2, 'tablas': {
                TABLAS[table]: [fila_sql(row) for row in rows] for table, rows in encode_state(updated, WORKSPACE).items()}})
        repo = SupabaseRepository('https://project.example', 'test-key', WORKSPACE, transport=httpx.MockTransport(respond))
        saved = asyncio.run(repo.save(updated, 1, before=before, actor=ACTOR))
        self.assertEqual(saved['data']['tasks'][0]['done'], True)
        path, body = calls[0]
        self.assertEqual(path, '/rest/v1/rpc/licihub_crm_guardar')
        self.assertEqual({change['tabla'] for change in body['p_cambios']}, {'tareas', 'actividades'})
        self.assertNotIn('data', body)
        self.assertEqual(body['p_actor_usuario_id'], ACTOR['id'])
        self.assertEqual(body['p_solicitud_id'], 'second')

    def test_maps_revision_conflict_and_fails_closed_if_schema_is_not_installed(self):
        for code, status, exception in [('40001', 409, Conflict), ('PGRST202', 404, StorageUnavailable)]:
            transport = httpx.MockTransport(lambda r: httpx.Response(status, json={'code': code, 'message': 'Internal SQL details must not escape'}))
            repo = SupabaseRepository('https://project.example', 'test-key', WORKSPACE, transport=transport)
            with self.assertRaises(exception):
                asyncio.run(repo.load())

    def test_membership_and_state_calls_include_the_configured_workspace(self):
        calls = []
        def respond(request):
            calls.append((request.url.path, json.loads(request.content)))
            value = {'nombre_visible': 'Asesor', 'rol': 'commercial'} if request.url.path.endswith('_miembro') else {'revision': 0, 'tablas': {}}
            return httpx.Response(200, json=value)
        repo = SupabaseRepository('https://project.example', 'test-key', WORKSPACE, transport=httpx.MockTransport(respond))
        self.assertEqual(asyncio.run(repo.member(ACTOR['id']))['role'], 'commercial')
        asyncio.run(repo.load(request_id='operation'))
        self.assertEqual(calls[1][1], {'p_espacio_id': WORKSPACE, 'p_solicitud_id': 'operation'})
        self.assertTrue(all(body['p_espacio_id'] == WORKSPACE for _, body in calls))
