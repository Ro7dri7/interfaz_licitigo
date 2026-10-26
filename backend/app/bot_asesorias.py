"""Confirmación de solicitudes comerciales desde un chat privado vinculado."""
import hashlib
import re
import secrets
import time

import httpx
from pydantic import BaseModel, EmailStr
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from . import asesorias, auth, suscripciones
from .supabase import SupabaseError

PENDIENTE = 'solicitud_asesoria'


class ContactoPortal(BaseModel):
    email: EmailStr


async def _vinculo(update: Update) -> dict | None:
    if not update.effective_chat or update.effective_chat.type != 'private':
        await update.effective_message.reply_text('Solicita asesoría en el chat privado con este bot.')
        return None
    sus = await suscripciones.de_chat(update.effective_chat.id, incluir_pausadas=True)
    if not sus:
        await update.effective_message.reply_text('Primero conecta Telegram desde Mi perfil en el portal LiciHub.')
        return None
    return sus


async def cmd_asesor(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    sus = await _vinculo(update)
    if not sus:
        return
    servicio = ' '.join(ctx.args or []).strip() or asesorias.SERVICIO_GENERAL
    if len(servicio) > 160:
        await update.effective_message.reply_text('Resume el servicio en un máximo de 160 caracteres.')
        return
    try:
        asesorias.comprobar_configuracion()
        key = auth.get_settings().supabase_secret_key
        async with auth._http() as http:
            respuesta = await http.get(f'/admin/users/{sus["perfil_id"]}',
                                       headers={'Authorization': f'Bearer {key}'} if key.startswith('eyJ') else {})
        if respuesta.status_code != 200:
            raise asesorias.AsesoriaError(503, 'No pudimos recuperar tu contacto. Inténtalo más tarde.')
        email = str(ContactoPortal.model_validate(respuesta.json()).email)
        payload = await asesorias.preparar(sus['perfil_id'], email, 'Telegram', servicio=servicio,
                                           username=update.effective_user.username)
        nonce = secrets.token_hex(8)
        ctx.user_data[PENDIENTE] = {'nonce': nonce, 'perfil': sus['perfil_id'], 'payload': payload, 'creado': time.time()}
        await update.effective_message.reply_text(
            f'¿Quieres que un asesor te contacte sobre {servicio}?\n'
            'Compartiremos con el equipo comercial tu nombre, empresa, correo y usuario público de Telegram, si tienes uno. '
            'El asesor recibirá la solicitud en horario de atención.',
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton('Solicitar asesoría', callback_data=f'asesoria:confirmar:{nonce}')],
                [InlineKeyboardButton('Cancelar', callback_data=f'asesoria:cancelar:{nonce}')],
            ]))
    except asesorias.AsesoriaError as error:
        await update.effective_message.reply_text(error.mensaje)
    except (httpx.HTTPError, SupabaseError, ValueError):
        await update.effective_message.reply_text('No pudimos preparar la solicitud. Inténtalo más tarde.')


async def confirmar_asesoria(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    sus = await _vinculo(update)
    if not sus:
        return
    pendiente = ctx.user_data.get(PENDIENTE)
    accion, nonce = str(query.data).split(':')[1:]
    if (not pendiente or pendiente['nonce'] != nonce or pendiente['perfil'] != sus['perfil_id']
            or time.time() - pendiente['creado'] > 900):
        await update.effective_message.reply_text('La confirmación venció. Envía /asesor para generar una nueva.')
        return
    if accion == 'cancelar':
        ctx.user_data.pop(PENDIENTE, None)
        await query.edit_message_text('Solicitud cancelada. No enviamos tus datos al CRM.')
        return
    namespace = hashlib.sha256(asesorias.get_settings().telegram_bot_token.encode()).hexdigest()[:8]
    request_id = f'telegram:{namespace}:{sus["perfil_id"]}:{query.message.message_id}'
    try:
        resultado = await asesorias.solicitar(request_id, sus['perfil_id'], pendiente['payload'])
        await query.edit_message_text(resultado['mensaje'])
    except asesorias.AsesoriaError as error:
        await update.effective_message.reply_text(error.mensaje)
    except OSError:
        await update.effective_message.reply_text('No pudimos confirmar el guardado. Intenta nuevamente con el mismo botón.')


def pide_asesor(texto: str) -> bool:
    return bool(re.fullmatch(r'\s*(?:quiero\s+)?(?:hablar|comunicarme|contactar)(?:\s+con)?\s+(?:un\s+)?asesor[.!?]?\s*', texto, re.I))
