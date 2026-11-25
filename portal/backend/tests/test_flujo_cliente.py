"""Recorrido del cliente: registro, RUC, filtro por departamento, desbloqueo y Stripe."""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.auth import asegurar_perfil
from app.licitaciones import invalidar_resumen_departamentos, normalizar_departamento, resumen_departamentos
from app.main import app

PERFIL = "11111111-1111-1111-1111-111111111111"
AUTH = {"Authorization": "Bearer token-cliente"}


class _Resp:
    def __init__(self, status: int, data: dict):
        self.status_code = status
        self._data = data
        self.text = ""

    def json(self):
        return self._data


class _AuthHttp:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def post(self, path, **_kw):
        if path == "/admin/users":
            return _Resp(200, {"id": PERFIL, "email": "ana@empresa.pe"})
        if path == "/token":
            return _Resp(200, {
                "access_token": "token-cliente", "refresh_token": "refresco", "expires_in": 3600,
                "user": {"id": PERFIL, "email": "ana@empresa.pe", "user_metadata": {"nombre": "Ana Perez"}},
            })
        raise AssertionError(path)


def _usuario():
    return {"id": PERFIL, "email": "ana@empresa.pe", "user_metadata": {"nombre": "Ana Perez"}}


class RegistroYOnboarding(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_registro_crea_perfil_free_con_cinco_creditos(self):
        db = MagicMock()
        db.insert = AsyncMock()
        with patch("app.auth._http", return_value=_AuthHttp()), \
                patch("app.auth.get_db", return_value=db), \
                patch("app.main.auth.rol_comercial", new=AsyncMock(return_value="cliente")):
            response = self.client.post("/api/auth/registro", json={
                "nombre": "Ana Perez", "email": "ana@empresa.pe", "password": "Secreta1!",
            })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["rol"], "cliente")
        fila = db.insert.await_args.args[1]
        self.assertEqual(fila["creditos_desbloqueo"], 5)
        self.assertEqual(fila["plan_actual"], "free")
        self.assertEqual(fila["id"], PERFIL)

    def test_onboarding_guarda_el_ruc(self):
        perfil = {"id": PERFIL, "ruc_empresa": None, "keywords": [], "nombre_completo": "Ana",
                  "creditos_desbloqueo": 5, "plan_actual": "free"}
        db = MagicMock()
        db.update = AsyncMock()
        db.count = AsyncMock(return_value=0)
        with patch("app.auth._usuario_de_token", new=AsyncMock(return_value=_usuario())), \
                patch("app.main.auth.perfil", new=AsyncMock(return_value=perfil)), \
                patch("app.main.empresa_guardada", new=AsyncMock(return_value={"ruc": "20100000001"})), \
                patch("app.main.get_db", return_value=db), \
                patch("app.desbloqueos.get_db", return_value=db):
            response = self.client.put("/api/perfil", headers=AUTH, json={"ruc": "20100000001"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["ruc"], "20100000001")
        self.assertEqual(response.json()["desbloqueos"]["creditos"], 5)
        self.assertEqual(db.update.await_args.args[2]["ruc_empresa"], "20100000001")


class MapaDepartamentos(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        invalidar_resumen_departamentos()

    def tearDown(self):
        invalidar_resumen_departamentos()

    def test_normaliza_nombres_y_deja_vacios_fuera_del_mapa(self):
        self.assertEqual(normalizar_departamento("Áncash"), "ANCASH")
        self.assertEqual(normalizar_departamento("Municipalidad Metropolitana de Lima"), "LIMA")
        self.assertEqual(normalizar_departamento("El Callao"), "CALLAO")
        self.assertIsNone(normalizar_departamento("  "))
        self.assertIsNone(normalizar_departamento(None))
        self.assertEqual(normalizar_departamento("Marte"), "OTROS")

    async def test_resume_abiertas_y_cachea_cinco_minutos(self):
        db = MagicMock()
        db.select = AsyncMock(return_value=[
            {"departamento": "Lima", "monto_referencial": 100},
            {"departamento": "Lima", "monto_referencial": 50},
            {"departamento": "Cajamarca", "monto_referencial": 20},
            {"departamento": None, "monto_referencial": 7},
            {"departamento": "", "monto_referencial": 3},
        ])
        with patch("app.licitaciones.get_db", return_value=db):
            primero = await resumen_departamentos()
            segundo = await resumen_departamentos()
        self.assertEqual(primero["total_licitaciones"], 5)
        self.assertEqual(primero["inversion_total"], 180)
        self.assertEqual(primero["departamentos"][0]["departamento"], "LIMA")
        self.assertEqual(primero["departamentos"][0]["cantidad"], 2)
        self.assertEqual(primero["departamentos"][1], {"departamento": "CAJAMARCA", "cantidad": 1, "monto_total": 20})
        self.assertNotIn("OTROS", [d["departamento"] for d in primero["departamentos"]])
        self.assertEqual(segundo, primero)
        db.select.assert_awaited_once()

    def test_el_resumen_es_publico(self):
        self.client = TestClient(app)
        with patch("app.main.licitaciones.resumen_departamentos", new=AsyncMock(return_value={
            "total_licitaciones": 2, "inversion_total": 10, "departamentos": [],
        })):
            response = self.client.get("/api/licitaciones/resumen-departamentos")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total_licitaciones"], 2)


class DescubrimientoYPago(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.perfil = {"id": PERFIL, "ruc_empresa": "20100000001", "keywords": ["OBRA"],
                       "creditos_desbloqueo": 5, "plan_actual": "free"}

    def _sesion(self):
        return patch("app.auth._usuario_de_token", new=AsyncMock(return_value=_usuario()))

    def test_filtra_licitaciones_por_departamento(self):
        buscar = AsyncMock(return_value={"items": [], "total": 4, "montoTotal": 80, "altaAfinidad": 1})
        with self._sesion(), \
                patch("app.main.auth.perfil", new=AsyncMock(return_value=self.perfil)), \
                patch("app.main.ciius_de_busqueda", new=AsyncMock(return_value=["4100"])), \
                patch("app.main.licitaciones.buscar_pagina", new=buscar), \
                patch("app.main.desbloqueos.cupo", new=AsyncMock(return_value={
                    "usados": 0, "limite": 5, "disponibles": 5, "creditos": 5, "plan": "free"})), \
                patch("app.main.desbloqueos.enlaces_desbloqueados", new=AsyncMock(return_value={})):
            response = self.client.get("/api/licitaciones", headers=AUTH, params={"departamento": "CAJAMARCA"})
            malo = self.client.get("/api/licitaciones", headers=AUTH, params={"departamento": "MARTE"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(buscar.await_args.kwargs["departamento"], "CAJAMARCA")
        self.assertEqual(response.json()["desbloqueos"]["creditos"], 5)
        self.assertEqual(malo.status_code, 422)

    def test_desbloquear_descuenta_una_vez_y_sin_creditos_abre_402(self):
        db = MagicMock()
        db.rpc = AsyncMock(side_effect=[
            {"estado": "descontado", "creditos": 4},
            {"estado": "ya_desbloqueada", "creditos": 4},
            {"estado": "sin_creditos", "creditos": 0},
        ])
        detalle = AsyncMock(side_effect=[
            {"desbloqueada": True, "creditos": 4, "disponibles": 4, "usados": 1, "limite": 5, "plan": "free"},
            {"desbloqueada": True, "creditos": 4, "disponibles": 4, "usados": 1, "limite": 5, "plan": "free"},
        ])
        with self._sesion(), \
                patch("app.main.auth.perfil", new=AsyncMock(return_value=dict(self.perfil))), \
                patch("app.desbloqueos.get_db", return_value=db), \
                patch("app.desbloqueos.iniciar_analisis", new=AsyncMock()), \
                patch("app.desbloqueos.detalle", new=detalle):
            primero = self.client.post("/api/licitaciones/9/desbloquear", headers=AUTH)
            segundo = self.client.post("/api/licitaciones/9/desbloquear", headers=AUTH)
            tercero = self.client.post("/api/licitaciones/9/desbloquear", headers=AUTH)
        self.assertEqual(primero.status_code, 200)
        self.assertEqual(primero.json()["creditos"], 4)
        self.assertEqual(segundo.status_code, 200)
        self.assertEqual(segundo.json()["creditos"], 4)
        self.assertEqual(db.rpc.await_args_list[1].args[0], "consumir_credito_desbloqueo")
        self.assertEqual(tercero.status_code, 402)
        self.assertEqual(tercero.json()["error"], "sin_creditos")

    def test_checkout_y_verificacion_de_stripe(self):
        with self._sesion(), \
                patch("app.main.billing.crear_checkout", return_value="https://checkout.stripe.test/pay/sesion") as crear, \
                patch("app.main.billing.recuperar_sesion", return_value={
                    "payment_status": "paid", "metadata": {"perfil_id": PERFIL, "plan_id": "comercial"},
                }), \
                patch("app.main.billing.acreditar_pago_stripe", new=AsyncMock(return_value=105)):
            checkout = self.client.post("/api/billing/checkout", headers=AUTH, json={"plan_id": "comercial"})
            verificado = self.client.post("/api/billing/verify-session", headers=AUTH,
                                          json={"session_id": "sesion-pago-1"})
        self.assertEqual(checkout.status_code, 200)
        self.assertEqual(checkout.json()["checkout_url"], "https://checkout.stripe.test/pay/sesion")
        crear.assert_called_once_with(PERFIL, "comercial")
        self.assertEqual(verificado.status_code, 200)
        self.assertEqual(verificado.json(), {"creditos": 105, "plan": "comercial"})


class PerfilInicial(unittest.IsolatedAsyncioTestCase):
    async def test_asegurar_perfil_no_pisa_creditos_si_ya_existe(self):
        db = MagicMock()
        db.insert = AsyncMock()
        with patch("app.auth.get_db", return_value=db):
            await asegurar_perfil(PERFIL, "Ana Perez")
        self.assertEqual(db.insert.await_args.kwargs["ignore_duplicates"], True)
        self.assertEqual(db.insert.await_args.args[1]["plan_actual"], "free")
