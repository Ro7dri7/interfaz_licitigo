import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.billing import BillingError, PLANES, acreditar_pago_stripe, crear_checkout, evento_firmado
from app.desbloqueos import DesbloqueoError, desbloquear
from app.main import app


PERFIL = "11111111-1111-1111-1111-111111111111"


class Creditos(unittest.IsolatedAsyncioTestCase):
    async def test_sin_creditos_responde_402(self):
        perfil = {"id": PERFIL, "ruc_empresa": "20100000001", "creditos_desbloqueo": 0}
        db = MagicMock()
        db.rpc = AsyncMock(return_value={"estado": "sin_creditos", "creditos": 0})
        with patch("app.desbloqueos.get_db", return_value=db):
            with self.assertRaises(DesbloqueoError) as ctx:
                await desbloquear(perfil, 9)
        self.assertEqual(ctx.exception.status, 402)
        self.assertEqual(ctx.exception.error, "sin_creditos")
        db.rpc.assert_awaited()

    async def test_ya_desbloqueada_no_vuelve_a_cobrar_y_sigue_el_analisis(self):
        perfil = {"id": PERFIL, "ruc_empresa": "20100000001", "creditos_desbloqueo": 4}
        db = MagicMock()
        db.rpc = AsyncMock(return_value={"estado": "ya_desbloqueada", "creditos": 4})
        with patch("app.desbloqueos.get_db", return_value=db), \
                patch("app.desbloqueos.iniciar_analisis", new=AsyncMock()) as analisis, \
                patch("app.desbloqueos.detalle", new=AsyncMock(return_value={"desbloqueada": True, "creditos": 4})):
            out = await desbloquear(perfil, 9)
        analisis.assert_awaited()
        self.assertEqual(out["creditos"], 4)


class Checkout(unittest.TestCase):
    def test_crea_sesion_en_pen_con_metadata(self):
        settings = MagicMock(stripe_secret_key="clave-stripe-prueba", portal_origin="https://licihub.vercel.app")
        sesion = MagicMock(url="https://checkout.stripe.test/pay/sesion-prueba")
        with patch("app.billing.get_settings", return_value=settings), \
                patch("app.billing.stripe.checkout.Session.create", return_value=sesion) as crear:
            url = crear_checkout(PERFIL, "comercial")
        self.assertEqual(url, sesion.url)
        kwargs = crear.call_args.kwargs
        self.assertEqual(kwargs["mode"], "payment")
        self.assertEqual(kwargs["line_items"][0]["price_data"]["currency"], "pen")
        self.assertEqual(kwargs["line_items"][0]["price_data"]["unit_amount"], PLANES["comercial"]["centimos"])
        self.assertEqual(kwargs["metadata"]["perfil_id"], PERFIL)
        self.assertEqual(kwargs["metadata"]["creditos"], "100")
        self.assertIn("session_id={CHECKOUT_SESSION_ID}", kwargs["success_url"])

    def test_plan_desconocido(self):
        with self.assertRaises(BillingError) as ctx:
            crear_checkout(PERFIL, "ilimitado")
        self.assertEqual(ctx.exception.status, 422)


class Webhook(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_webhook_sin_origin_acepta_el_cuerpo_crudo(self):
        evento = {"type": "checkout.session.completed", "data": {"object": {
            "id": "sesion-pago-1", "payment_status": "paid",
            "metadata": {"perfil_id": PERFIL, "plan_id": "explorador", "creditos": "30"},
            "amount_total": 7990,
        }}}
        with patch("app.billing.evento_firmado", return_value=evento), \
                patch("app.main.billing.acreditar_pago_stripe", new=AsyncMock(return_value=35)) as acreditar:
            response = self.client.post("/api/billing/webhook", content=b'{"raw":true}',
                                        headers={"stripe-signature": "t=1,v1=firma"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"received": True})
        acreditar.assert_awaited()

    def test_firma_invalida(self):
        with patch("app.billing.get_settings") as settings:
            settings.return_value.stripe_webhook_secret = "secreto-webhook-prueba"
            settings.return_value.stripe_secret_key = "clave-stripe-prueba"
            with patch("app.billing.stripe.Webhook.construct_event", side_effect=ValueError("bad")):
                with self.assertRaises(BillingError) as ctx:
                    evento_firmado(b"{}", "firma")
        self.assertEqual(ctx.exception.status, 400)


class Acreditacion(unittest.IsolatedAsyncioTestCase):
    async def test_suma_creditos_via_rpc(self):
        db = MagicMock()
        db.rpc = AsyncMock(return_value=35)
        sesion = {
            "id": "sesion-pago-1", "payment_status": "paid", "amount_total": 7990,
            "metadata": {"perfil_id": PERFIL, "plan_id": "explorador", "creditos": "30"},
        }
        with patch("app.billing.get_db", return_value=db):
            saldo = await acreditar_pago_stripe(sesion)
        self.assertEqual(saldo, 35)
        args = db.rpc.await_args.args
        self.assertEqual(args[0], "acreditar_pago_stripe")
        self.assertEqual(args[1]["p_creditos"], 30)
        self.assertEqual(args[1]["p_session"], "sesion-pago-1")
