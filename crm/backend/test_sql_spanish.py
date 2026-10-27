import asyncio
import json
import unittest

import httpx

from backend.repository import SupabaseRepository


class SpanishSqlContractTests(unittest.TestCase):
    def test_supabase_uses_spanish_function_parameters_and_preserves_the_ui_contract(self):
        calls = []

        def respond(request):
            calls.append((request.url.path, json.loads(request.content)))
            return httpx.Response(200, json={'revision': 0, 'tablas': {}})

        repo = SupabaseRepository('https://example.test', 'test-key', 'space', transport=httpx.MockTransport(respond))
        snapshot = asyncio.run(repo.load(request_id='solicitud'))
        self.assertEqual(snapshot['data']['companies'], [])
        self.assertEqual(calls, [('/rest/v1/rpc/licihub_crm_estado', {
            'p_espacio_id': 'space', 'p_solicitud_id': 'solicitud'})])
