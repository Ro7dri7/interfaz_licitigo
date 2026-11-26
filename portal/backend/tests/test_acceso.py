import base64
import hashlib
import time
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from pydantic import ValidationError

from app.auth import codigo_pkce, validar_contrasena, volver_seguro
from app.main import Registro, app


class RutasInternas(unittest.TestCase):
    def test_solo_acepta_rutas_del_mismo_sitio(self):
        self.assertEqual(volver_seguro("/comercial/negocios"), "/comercial/negocios")
        self.assertEqual(volver_seguro("/app/descubrimiento"), "/app/descubrimiento")
        for malo in ("https://evil.test", "//evil.test", "/\\evil", "comercial", None, ""):
            self.assertIsNone(volver_seguro(malo))

    def test_el_challenge_pkce_es_el_hash_del_verifier(self):
        verifier, challenge = codigo_pkce()
        esperado = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        self.assertEqual(challenge, esperado)
        self.assertNotIn("=", challenge)

    def test_el_registro_solo_acepta_clave_fuerte_y_sin_rol(self):
        with self.assertRaises(ValidationError):
            Registro(nombre="Ana Perez", email="ana@empresa.pe", password="secreta123")
        with self.assertRaises(ValidationError):
            Registro(nombre="Ana Perez", email="ana@empresa.pe", password="Secreta1!", rol="admin")
        self.assertEqual(validar_contrasena("Secreta1!"), "Secreta1!")
        cuenta = Registro(nombre="Ana Perez", email="ana@empresa.pe", password="Secreta1!")
        self.assertEqual(cuenta.model_dump(), {"nombre": "Ana Perez", "email": "ana@empresa.pe", "password": "Secreta1!", "telefono": ""})


def _sesion():
    return {
        "accessToken": "token-de-acceso-portal",
        "refreshToken": "token-de-refresco-portal",
        "expiresAt": int(time.time()) + 3600,
        "usuario": {"id": "11111111-1111-1111-1111-111111111111", "email": "ana@empresa.pe", "nombre": "Ana"},
    }


class LoginUnico(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_admin_recibe_rol_y_cookies_del_crm(self):
        with patch("app.main.auth.iniciar_sesion", new=AsyncMock(return_value=_sesion())), \
                patch("app.main.auth.rol_comercial", new=AsyncMock(return_value="admin")):
            response = self.client.post("/api/auth/login", json={"email": "ana@empresa.pe", "password": "secreta123"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["rol"], "admin")
        cookies = " ".join(response.headers.get_list("set-cookie"))
        self.assertIn("lici_crm_session=token-de-acceso-portal", cookies)
        self.assertIn("lici_crm_refresh=token-de-refresco-portal", cookies)
        self.assertIn("HttpOnly", cookies)

    def test_cliente_no_recibe_la_sesion_del_crm(self):
        with patch("app.main.auth.iniciar_sesion", new=AsyncMock(return_value=_sesion())), \
                patch("app.main.auth.rol_comercial", new=AsyncMock(return_value="cliente")):
            response = self.client.post("/api/auth/login", json={"email": "ana@empresa.pe", "password": "secreta123"})
        self.assertEqual(response.json()["rol"], "cliente")
        cookies = " ".join(response.headers.get_list("set-cookie"))
        self.assertNotIn("token-de-acceso-portal", cookies)

    def test_la_ficha_de_empresa_exige_sesion(self):
        response = self.client.get("/api/empresas/20123456789")
        self.assertEqual(response.status_code, 401)

    def test_el_callback_de_google_sin_cookie_vuelve_a_ingresar(self):
        response = self.client.get("/api/auth/google/callback", params={"code": "abc"}, follow_redirects=False)
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.headers["location"].startswith("/ingresar?error=google"))
