from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from app import asesorias, bot_asesorias


class BotAsesoriaTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.update = SimpleNamespace(
            effective_chat=SimpleNamespace(id=123, type='private'),
            effective_user=SimpleNamespace(id=123, username='ana_prueba'),
            effective_message=SimpleNamespace(reply_text=AsyncMock()),
            callback_query=SimpleNamespace(data='', answer=AsyncMock(), edit_message_text=AsyncMock(),
                                           message=SimpleNamespace(message_id=50)))
        self.ctx = SimpleNamespace(args=['ISO', '9001'], user_data={})
        self.subscription = patch('app.bot_asesorias.suscripciones.de_chat', new=AsyncMock(return_value={'perfil_id': 'perfil-1'}))
        self.sus = self.subscription.start()
        self.addCleanup(self.subscription.stop)

    async def present(self):
        http = AsyncMock()
        http.get.return_value = httpx.Response(200, json={'email': 'ana@example.com'})
        with patch('app.bot_asesorias.asesorias.comprobar_configuracion'), \
                patch('app.bot_asesorias.auth._http') as factory, \
                patch('app.bot_asesorias.auth.get_settings', return_value=SimpleNamespace(supabase_secret_key='test-only')), \
                patch('app.bot_asesorias.asesorias.preparar', new=AsyncMock(return_value={'origin': 'Telegram', 'kind': 'advice'})):
            factory.return_value.__aenter__.return_value = http
            await bot_asesorias.cmd_asesor(self.update, self.ctx)
        return self.ctx.user_data[bot_asesorias.PENDIENTE]['nonce']

    async def test_group_or_unlinked_chat_cannot_create_requests(self):
        with patch('app.bot_asesorias.asesorias.solicitar', new=AsyncMock()) as send:
            self.update.effective_chat.type = 'group'
            await bot_asesorias.cmd_asesor(self.update, self.ctx)
            self.sus.assert_not_awaited()
            self.update.effective_chat.type = 'private'
            self.sus.return_value = None
            await bot_asesorias.cmd_asesor(self.update, self.ctx)
            send.assert_not_awaited()
            self.assertEqual(self.ctx.user_data, {})

    async def test_confirmation_is_required_and_cancel_sends_nothing(self):
        with patch('app.bot_asesorias.asesorias.solicitar', new=AsyncMock()) as send:
            nonce = await self.present()
            send.assert_not_awaited()
            text = self.update.effective_message.reply_text.call_args.args[0]
            self.assertIn('Compartiremos', text)
            self.update.callback_query.data = f'asesoria:cancelar:{nonce}'
            await bot_asesorias.confirmar_asesoria(self.update, self.ctx)
            send.assert_not_awaited()
            self.assertEqual(self.ctx.user_data, {})

    async def test_repeated_confirmation_keeps_same_id_and_honestly_reports_pending(self):
        nonce = await self.present()
        self.update.callback_query.data = f'asesoria:confirmar:{nonce}'
        with patch('app.bot_asesorias.asesorias.solicitar', new=AsyncMock(return_value={
                'estado': 'pendiente', 'mensaje': 'Solicitud guardada, pendiente de entrega.'})) as send, \
                patch('app.bot_asesorias.asesorias.get_settings', return_value=SimpleNamespace(telegram_bot_token='test-only')):
            await bot_asesorias.confirmar_asesoria(self.update, self.ctx)
            await bot_asesorias.confirmar_asesoria(self.update, self.ctx)
            self.assertEqual(send.await_args_list[0], send.await_args_list[1])
            self.update.callback_query.edit_message_text.assert_awaited_with('Solicitud guardada, pendiente de entrega.')

    async def test_relinked_account_or_expired_prompt_is_rejected(self):
        nonce = await self.present()
        self.update.callback_query.data = f'asesoria:confirmar:{nonce}'
        self.sus.return_value = {'perfil_id': 'another-profile'}
        with patch('app.bot_asesorias.asesorias.solicitar', new=AsyncMock()) as send:
            await bot_asesorias.confirmar_asesoria(self.update, self.ctx)
            send.assert_not_awaited()

    def test_natural_text_only_recognizes_explicit_request(self):
        self.assertTrue(bot_asesorias.pide_asesor('Quiero hablar con un asesor'))
        self.assertFalse(bot_asesorias.pide_asesor('¿Qué es un asesor?'))


if __name__ == '__main__':
    unittest.main()
