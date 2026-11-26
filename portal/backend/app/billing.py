"""Stripe Checkout (pago único, PEN) y acreditación idempotente de créditos."""

import logging
from decimal import Decimal

import stripe
from stripe import SignatureVerificationError

from .config import get_settings
from .supabase import get_db

log = logging.getLogger(__name__)

PLANES = {
    "explorador": {
        "nombre": "LiciHub · Plan Explorador (30 créditos)",
        "centimos": 7990,
        "creditos": 30,
        "etiqueta": "Plan Explorador",
    },
    "comercial": {
        "nombre": "LiciHub · Plan Comercial (100 créditos)",
        "centimos": 18990,
        "creditos": 100,
        "etiqueta": "Plan Comercial",
    },
    "empresarial": {
        "nombre": "LiciHub · Plan Empresarial (250 créditos)",
        "centimos": 34990,
        "creditos": 250,
        "etiqueta": "Plan Empresarial",
    },
}

OWNER_PORTAL = "Licihub Portal"


class BillingError(Exception):
    def __init__(self, status: int, mensaje: str):
        super().__init__(mensaje)
        self.status = status
        self.mensaje = mensaje


def como_dict(valor) -> dict:
    """Stripe Session/Event → dict. Los objetos Stripe no implementan .get()."""
    if valor is None:
        return {}
    if isinstance(valor, dict):
        return valor
    to_dict = getattr(valor, "to_dict", None)
    if callable(to_dict):
        convertido = to_dict()
        return convertido if isinstance(convertido, dict) else {}
    # Fallback para stubs de test u objetos con atributos públicos.
    try:
        return dict(valor)
    except (TypeError, ValueError):
        return {}


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


def evento_firmado(payload: bytes, firma: str) -> dict:
    secreto = get_settings().stripe_webhook_secret.strip()
    if not secreto:
        raise BillingError(503, "Stripe no está configurado.")
    _clave()
    if not firma:
        raise BillingError(400, "Falta la firma de Stripe.")
    try:
        return como_dict(stripe.Webhook.construct_event(payload, firma, secreto))
    except (ValueError, SignatureVerificationError) as e:
        raise BillingError(400, "Firma de Stripe no válida.") from e


def recuperar_sesion(session_id: str) -> dict:
    if not session_id or len(session_id) > 255:
        raise BillingError(422, "Sesión de pago no válida.")
    _clave()
    return como_dict(stripe.checkout.Session.retrieve(session_id))


async def _registrar_venta_crm(session: dict, *, perfil_id: str, plan_id: str, plan: dict, monto: Decimal) -> None:
    """Crea el negocio Ganado en el CRM (idempotente por session_id de Stripe)."""
    try:
        from . import asesorias
    except ImportError:
        return
    config = get_settings()
    if not config.crm_api_url or not config.crm_ingest_key:
        return
    session_id = str(session.get("id") or "")
    if not session_id:
        return
    db = get_db()
    perfiles = await db.select(
        "perfiles",
        {"select": "id,ruc_empresa,nombre_completo", "id": f"eq.{perfil_id}"},
        limit=1,
    )
    perfil = perfiles[0] if perfiles else {}
    ruc = str(perfil.get("ruc_empresa") or "")
    empresa = f"Cliente portal {perfil_id[:8]}"
    if len(ruc) == 11:
        try:
            proveedores = await db.select("proveedores", {"select": "razon_social", "ruc": f"eq.{ruc}"}, limit=1)
            empresa = (proveedores[0].get("razon_social") if proveedores else None) or f"Empresa RUC {ruc}"
        except Exception:
            empresa = f"Empresa RUC {ruc}"
    customer = como_dict(session.get("customer_details"))
    email = str(customer.get("email") or session.get("customer_email") or "")[:254]
    telefono = str((customer.get("phone") or ""))[:30]
    payload = {
        "company": str(empresa)[:160],
        "ruc": ruc if len(ruc) == 11 else "",
        "contact": str(perfil.get("nombre_completo") or customer.get("name") or "Cliente LiciHub")[:100],
        "email": email,
        "phone": telefono,
        "origin": "Lici",
        "kind": "sale",
        "service": f"{plan['etiqueta']} ({plan['creditos']} créditos)"[:160],
        "owner": OWNER_PORTAL,
        "evidence": "none",
        "notes": (
            f"Pago Stripe {session_id}\n"
            f"Plan {plan_id}: {plan['creditos']} créditos · S/ {monto}"
        )[:3000],
        "amount": str(monto),
    }
    request_id = f"stripe:{session_id}"
    try:
        await asesorias.solicitar(request_id, perfil_id, payload)
    except Exception as e:
        log.warning("No se pudo registrar la venta %s en el CRM: %s", session_id, e)


async def acreditar_pago_stripe(session) -> int:
    """Suma créditos una sola vez por stripe_session_id. Devuelve el saldo."""
    session = como_dict(session)
    meta = como_dict(session.get("metadata"))
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
    await _registrar_venta_crm(session, perfil_id=perfil_id, plan_id=plan_id, plan=plan, monto=monto)
    return int(saldo or 0)
