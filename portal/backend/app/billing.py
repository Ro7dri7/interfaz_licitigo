"""Stripe Checkout (pago único, PEN) y acreditación idempotente de créditos."""

from decimal import Decimal

import stripe
from stripe import SignatureVerificationError

from .config import get_settings
from .supabase import get_db

PLANES = {
    "explorador": {
        "nombre": "LiciHub · Plan Explorador (30 créditos)",
        "centimos": 7990,
        "creditos": 30,
    },
    "comercial": {
        "nombre": "LiciHub · Plan Comercial (100 créditos)",
        "centimos": 18990,
        "creditos": 100,
    },
    "empresarial": {
        "nombre": "LiciHub · Plan Empresarial (250 créditos)",
        "centimos": 34990,
        "creditos": 250,
    },
}


class BillingError(Exception):
    def __init__(self, status: int, mensaje: str):
        super().__init__(mensaje)
        self.status = status
        self.mensaje = mensaje


def _clave() -> str:
    clave = get_settings().stripe_secret_key.strip()
    if not clave:
        raise BillingError(503, "Stripe no está configurado.")
    stripe.api_key = clave
    return clave


def crear_checkout(perfil_id: str, plan_id: str) -> str:
    plan = PLANES.get(plan_id)
    if not plan:
        raise BillingError(422, "Plan no válido.")
    origen = get_settings().portal_origin.strip()
    if not origen:
        raise BillingError(503, "Configura PORTAL_ORIGIN con la URL pública del portal.")
    _clave()
    sesion = stripe.checkout.Session.create(
        mode="payment",
        success_url=f"{origen}/app?pago=exito&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origen}/app?pago=cancelado",
        line_items=[{
            "quantity": 1,
            "price_data": {
                "currency": "pen",
                "unit_amount": plan["centimos"],
                "product_data": {"name": plan["nombre"]},
            },
        }],
        metadata={
            "perfil_id": perfil_id,
            "plan_id": plan_id,
            "creditos": str(plan["creditos"]),
        },
        client_reference_id=perfil_id,
    )
    if not sesion.url:
        raise BillingError(502, "Stripe no devolvió la URL de pago.")
    return sesion.url


def evento_firmado(payload: bytes, firma: str):
    secreto = get_settings().stripe_webhook_secret.strip()
    if not secreto:
        raise BillingError(503, "Stripe no está configurado.")
    _clave()
    if not firma:
        raise BillingError(400, "Falta la firma de Stripe.")
    try:
        return stripe.Webhook.construct_event(payload, firma, secreto)
    except (ValueError, SignatureVerificationError) as e:
        raise BillingError(400, "Firma de Stripe no válida.") from e


def recuperar_sesion(session_id: str):
    if not session_id or len(session_id) > 255:
        raise BillingError(422, "Sesión de pago no válida.")
    _clave()
    return stripe.checkout.Session.retrieve(session_id)


async def acreditar_pago_stripe(session) -> int:
    """Suma créditos una sola vez por stripe_session_id. Devuelve el saldo."""
    meta = dict(session.get("metadata") or {})
    perfil_id = str(meta.get("perfil_id") or "")
    plan_id = str(meta.get("plan_id") or "")
    plan = PLANES.get(plan_id)
    try:
        creditos = int(meta.get("creditos") or 0)
    except (TypeError, ValueError):
        creditos = 0
    if plan and creditos != plan["creditos"]:
        creditos = plan["creditos"]
    if not perfil_id or not plan or creditos <= 0:
        raise BillingError(422, "El pago no trae un plan reconocible.")
    monto = Decimal(int(session.get("amount_total") or plan["centimos"])) / Decimal(100)
    saldo = await get_db().rpc("acreditar_pago_stripe", {
        "p_perfil": perfil_id,
        "p_session": str(session.get("id") or ""),
        "p_plan": plan_id,
        "p_creditos": creditos,
        "p_monto": str(monto),
        "p_estado": str(session.get("payment_status") or "paid"),
    })
    return int(saldo or 0)
