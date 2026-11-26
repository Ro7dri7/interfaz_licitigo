"""Google OAuth del portal: solo clientes, clave publicable y plan conservado."""

import time
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.auth import AuthError, plan_seguro, url_google, volver_cliente
from app.main import app

PERFIL = "11111111-1111-1111-1111-111111111111"


def _sesion(rol: str = "cliente") -> dict:
    return {
        "accessToken": "token-cliente",
        "refreshToken": "refresco",
        "expiresAt": int(time.time()) + 3600,
        "usuario": {"id": PERFIL, "email": "ana@empresa.pe", "nombre": "Ana"},
        "rol": rol,
    }


def _datos() -> dict:
    return {
        "access_token": "token-cliente",
        "refresh_token": "refresco",
        "expires_in": 3600,
        "user": {"id": PERFIL, "email": "ana@empresa.pe", "user_metadata": {"full_name": "Ana Perez"}},
    }


class Reglas(unittest.TestCase):
    def test_el_retorno_de_cliente_no_acepta_el_crm(self):
        self.assertEqual(volver_cliente("/app/descubrimiento"), "/app/descubrimiento")
        self.assertEqual(volver_cliente("/onboarding"), "/onboarding")
        self.assertIsNone(volver_cliente("/comercial"))
        self.assertIsNone(volver_cliente("/comercial/admin"))
        self.assertIsNone(volver_cliente("https://evil.test"))

    def test_solo_acepta_planes_de_creditos(self):
        self.assertEqual(plan_seguro("Comercial"), "comercial")
        self.assertIsNone(plan_seguro("free"))
        self.assertIsNone(plan_seguro("admin"))


class Autorizacion(unittest.IsolatedAsyncioTestCase):
    async def test_authorize_usa_solo_la_clave_publicable(self):
        ajustes = MagicMock(
            supabase_publishable_key="sb_publishable_prueba",
            supabase_secret_key="sb_secret_no_enviar",
            supabase_url="https://proyecto.supabase.co",
        )
        respuesta = MagicMock(status_code=302, headers={"location": "https://accounts.google.com/o/oauth2/v2/auth"})

        class Cliente:
            llamadas: list = []

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            async def get(self, _path, **kw):
                self.llamadas.append(kw)
                return respuesta

        cliente = Cliente()
        with patch("app.auth.get_settings", return_value=ajustes), \
                patch("app.auth.httpx.AsyncClient", return_value=cliente) as constructor:
            url = await url_google("https://licihub.vercel.app/api/auth/google/callback", "reto")
        self.assertEqual(url, "https://accounts.google.com/o/oauth2/v2/auth")
        self.assertEqual(constructor.call_args.kwargs["headers"]["apikey"], "sb_publishable_prueba")
        self.assertNotIn("sb_secret_no_enviar", str(constructor.call_args))
        self.assertEqual(
            cliente.llamadas[0]["params"]["redirect_to"],
            "https://licihub.vercel.app/api/auth/google/callback",
        )

    async def test_sin_clave_publicable_no_llama_a_supabase(self):
        ajustes = MagicMock(supabase_publishable_key="", supabase_secret_key="sb_secret_no_enviar",
                            supabase_url="https://proyecto.supabase.co")
        with patch("app.auth.get_settings", return_value=ajustes), \
                patch("app.auth.httpx.AsyncClient") as constructor:
            with self.assertRaises(AuthError):
                await url_google("https://licihub.vercel.app/api/auth/google/callback", "reto")
        constructor.assert_not_called()


class Callback(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_inicio_guarda_plan_y_descarta_volver_comercial(self):
        with patch("app.main.auth.url_google", new=AsyncMock(return_value="https://accounts.google.com/o/oauth2")):
            bueno = self.client.get("/api/auth/google", params={"volver": "/app/descubrimiento", "plan": "comercial"},
                                    follow_redirects=False)
            malo = self.client.get("/api/auth/google", params={"volver": "/comercial/admin", "plan": "gratis"},
                                   follow_redirects=False)
        self.assertEqual(bueno.status_code, 302)
        self.assertEqual(bueno.headers["location"], "https://accounts.google.com/o/oauth2")
        cookies = " ".join(bueno.headers.get_list("set-cookie"))
        self.assertIn("lici_plan=comercial", cookies)
        self.assertIn("lici_volver", cookies)
        self.assertNotIn("/comercial", " ".join(malo.headers.get_list("set-cookie")))
        self.assertNotIn("lici_plan", " ".join(malo.headers.get_list("set-cookie")))

    def test_usuario_nuevo_recibe_perfil_cliente_y_conserva_el_plan(self):
        asegurar = AsyncMock()
        with patch("app.main.auth.intercambiar_codigo", new=AsyncMock(return_value=_datos())), \
                patch("app.main.auth.perfil_existe", new=AsyncMock(return_value=False)), \
                patch("app.main.auth.rol_comercial", new=AsyncMock(return_value="cliente")), \
                patch("app.main.auth.asegurar_perfil", new=asegurar), \
                patch("app.main.auth.con_rol", new=AsyncMock(return_value=_sesion())):
            response = self.client.get(
                "/api/auth/google/callback", params={"code": "codigo"},
                cookies={"lici_pkce": "verificador", "lici_plan": "explorador", "lici_volver": "/comercial/admin"},
                follow_redirects=False,
            )
        self.assertEqual(response.status_code, 302)
        self.assertIn("/ingresar?ticket=", response.headers["location"])
        self.assertIn("plan=explorador", response.headers["location"])
        self.assertNotIn("volver=", response.headers["location"])
        asegurar.assert_awaited_once()
        self.assertEqual(asegurar.await_args.args[0], PERFIL)
        cookies = " ".join(response.headers.get_list("set-cookie"))
        self.assertNotIn("lici_crm_session=token-cliente", cookies)

    def test_perfil_existente_no_se_reescribe(self):
        asegurar = AsyncMock()
        with patch("app.main.auth.intercambiar_codigo", new=AsyncMock(return_value=_datos())), \
                patch("app.main.auth.perfil_existe", new=AsyncMock(return_value=True)), \
                patch("app.main.auth.asegurar_perfil", new=asegurar), \
                patch("app.main.auth.con_rol", new=AsyncMock(return_value=_sesion())):
            response = self.client.get(
                "/api/auth/google/callback", params={"code": "codigo"},
                cookies={"lici_pkce": "verificador"}, follow_redirects=False,
            )
        self.assertEqual(response.status_code, 302)
        asegurar.assert_not_awaited()

    def test_equipo_sin_perfil_no_entra_como_cliente(self):
        asegurar = AsyncMock()
        with patch("app.main.auth.intercambiar_codigo", new=AsyncMock(return_value=_datos())), \
                patch("app.main.auth.perfil_existe", new=AsyncMock(return_value=False)), \
                patch("app.main.auth.rol_comercial", new=AsyncMock(return_value="admin")), \
                patch("app.main.auth.asegurar_perfil", new=asegurar):
            response = self.client.get(
                "/api/auth/google/callback", params={"code": "codigo"},
                cookies={"lici_pkce": "verificador"}, follow_redirects=False,
            )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["location"], "/ingresar?error=google_equipo")
        asegurar.assert_not_awaited()
        self.assertNotIn("token-cliente", " ".join(response.headers.get_list("set-cookie")))
