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
            effective_message=SimpleNamespace(reply_text=AsyncMock(), text='', contact=None),
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
                patch('app.bot_asesorias.asesorias.preparar', new=AsyncMock(return_value={
                    'company':'Empresa Prueba', 'ruc':'20123456789', 'contact':'Ana', 'email':'ana@example.com',
                    'origin':'Telegram', 'kind':'advice', 'notes':'Contacto Telegram: https://t.me/ana_prueba', 'service':'ISO 9001'})):
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
            self.assertIn('solicitud', text)
            self.update.callback_query.data = f'asesoria:cancelar:{nonce}'
            await bot_asesorias.confirmar_asesoria(self.update, self.ctx)
            send.assert_not_awaited()
            self.assertEqual(self.ctx.user_data, {})

    async def test_repeated_confirmation_keeps_same_id_and_honestly_reports_pending(self):
        nonce = await self.present()
        await self.complete_wizard(nonce)
        self.update.callback_query.data = f'asesoria:confirmar:{nonce}'
        with patch('app.bot_asesorias.asesorias.solicitar', new=AsyncMock(return_value={
                'estado': 'pendiente', 'mensaje': 'Solicitud guardada, pendiente de entrega.'})) as send, \
                patch('app.bot_asesorias.asesorias.get_settings', return_value=SimpleNamespace(telegram_bot_token='test-only')):
            await bot_asesorias.confirmar_asesoria(self.update, self.ctx)
            await bot_asesorias.confirmar_asesoria(self.update, self.ctx)
            self.assertEqual(send.await_args_list[0], send.await_args_list[1])
            self.assertIn('pendiente de entrega', self.update.callback_query.edit_message_text.await_args.args[0])

    async def complete_wizard(self, nonce, phone='Usar mi correo'):
        self.update.callback_query.data = f'asesoria:tipo_quote:{nonce}'
        await bot_asesorias.confirmar_asesoria(self.update, self.ctx)
        self.update.effective_message.text = 'Necesito una certificación inicial para postular a una licitación.'
        await bot_asesorias.texto_asesoria(self.update, self.ctx)
        self.update.effective_message.text = phone
        await bot_asesorias.texto_asesoria(self.update, self.ctx)

    async def test_wizard_collects_need_and_phone_before_sending(self):
        nonce = await self.present()
        with patch('app.bot_asesorias.asesorias.solicitar', new=AsyncMock(return_value={'estado':'entregada','mensaje':'Solicitud recibida.'})) as send, \
                patch('app.bot_asesorias.asesorias.get_settings', return_value=SimpleNamespace(telegram_bot_token='test-only')):
            await self.complete_wizard(nonce, '+51 999 888 777')
            send.assert_not_awaited()
            self.update.callback_query.data = f'asesoria:confirmar:{nonce}'
            await bot_asesorias.confirmar_asesoria(self.update,self.ctx)
            payload = send.await_args.args[2]
            self.assertEqual(payload['kind'],'quote')
            self.assertEqual(payload['service'],'ISO 9001')
            self.assertEqual(payload['phone'],'+51 999 888 777')
            self.assertIn('certificación inicial',payload['notes'])

    async def test_shared_contact_must_belong_to_the_requesting_user(self):
        nonce = await self.present()
        await self.complete_wizard(nonce, 'teléfono inválido')
        self.assertEqual(self.ctx.user_data[bot_asesorias.PENDIENTE]['paso'],'contacto')
        self.update.effective_message.contact = SimpleNamespace(user_id=999,phone_number='51999888777')
        await bot_asesorias.texto_asesoria(self.update,self.ctx)
        self.assertEqual(self.ctx.user_data[bot_asesorias.PENDIENTE]['paso'],'contacto')

    async def test_default_flow_chooses_service_and_can_share_own_contact(self):
        self.ctx.args=[]
        nonce=await self.present()
        self.update.callback_query.data=f'asesoria:tipo_advice:{nonce}'
        await bot_asesorias.confirmar_asesoria(self.update,self.ctx)
        self.assertEqual(self.ctx.user_data[bot_asesorias.PENDIENTE]['paso'],'servicio')
        self.update.callback_query.data=f'asesoria:servicio_14001:{nonce}'
        await bot_asesorias.confirmar_asesoria(self.update,self.ctx)
        await bot_asesorias.cmd_omitir(self.update,self.ctx)
        self.update.effective_message.contact=SimpleNamespace(user_id=123,phone_number='+51999888777')
        await bot_asesorias.texto_asesoria(self.update,self.ctx)
        data=self.ctx.user_data[bot_asesorias.PENDIENTE]
        self.assertEqual(data['paso'],'resumen')
        self.assertEqual(data['payload']['service'],'ISO 14001')
        self.assertEqual(data['payload']['phone'],'+51999888777')

    async def test_cancel_after_confirmation_does_not_claim_to_revoke_saved_request(self):
        nonce=await self.present()
        self.ctx.user_data[bot_asesorias.PENDIENTE]['confirmada']=True
        self.update.callback_query.data=f'asesoria:cancelar:{nonce}'
        await bot_asesorias.confirmar_asesoria(self.update,self.ctx)
        self.assertIn('ya fue confirmada',self.update.effective_message.reply_text.await_args.args[0])
        self.assertIn(bot_asesorias.PENDIENTE,self.ctx.user_data)

    async def test_confirmation_cannot_bypass_the_questions(self):
        nonce = await self.present()
        self.update.callback_query.data=f'asesoria:confirmar:{nonce}'
        with patch('app.bot_asesorias.asesorias.solicitar',new=AsyncMock()) as send:
            await bot_asesorias.confirmar_asesoria(self.update,self.ctx)
            send.assert_not_awaited()

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
