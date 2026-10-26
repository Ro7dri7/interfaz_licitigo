"""Confirmación de solicitudes comerciales desde un chat privado vinculado."""
import hashlib
import re
import secrets
import time

import httpx
from pydantic import BaseModel, EmailStr
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup, ReplyKeyboardRemove, Update
from telegram.ext import ContextTypes

from . import asesorias, auth, suscripciones
from .supabase import SupabaseError

PENDIENTE = 'solicitud_asesoria'
SERVICIOS = {'9001':'ISO 9001', '14001':'ISO 14001', '45001':'ISO 45001', '37001':'ISO 37001',
             'paquete':'Paquete de certificaciones ISO', 'general':asesorias.SERVICIO_GENERAL, 'otro':'Otra certificación o servicio'}


def _botones(nonce: str, opciones: list[tuple[str, str]]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[InlineKeyboardButton(texto, callback_data=f'asesoria:{accion}:{nonce}')]
                                 for texto, accion in opciones])


async def _pedir_detalle(update: Update, data: dict) -> None:
    data['paso'] = 'detalle'
    await update.effective_message.reply_text('Cuéntanos brevemente qué necesitas: certificación inicial, renovación o ayuda con una licitación. '
                                               'Puedes incluir el código del proceso y tu plazo. Máximo 1000 caracteres; /omitir para precisarlo con el asesor.')


async def _pedir_contacto(update: Update, data: dict) -> None:
    data['paso'] = 'contacto'
    await update.effective_message.reply_text('¿Quieres añadir tu teléfono de contacto? Puedes compartir tu número, escribirlo con código de país o elegir «Usar mi correo».',
        reply_markup=ReplyKeyboardMarkup([[KeyboardButton('Compartir mi teléfono', request_contact=True)], ['Usar mi correo']],
                                         resize_keyboard=True, one_time_keyboard=True))


async def _resumen(update: Update, data: dict) -> None:
    data['paso'] = 'resumen'
    p = data['payload']
    texto = (f'Revisa tu solicitud:\nEmpresa: {p["company"]}\nRUC: {p["ruc"]}\nContacto: {p["contact"]}\n'
             f'Correo: {p["email"]}\nTeléfono: {p.get("phone") or "No indicado; usar correo"}\n'
             f'Tipo: {"Cotización" if p["kind"] == "quote" else "Asesoría"}\nServicio: {p["service"]}\n'
             f'Necesidad: {data.get("detalle") or "Por precisar con el asesor"}\n\n'
             'Compartiremos estos datos y tu usuario público de Telegram con el equipo comercial. ¿Confirmas el envío?')
    await update.effective_message.reply_text('Datos preparados para revisar.', reply_markup=ReplyKeyboardRemove())
    await update.effective_message.reply_text(texto, reply_markup=_botones(data['nonce'],
        [('Enviar solicitud', 'confirmar'), ('Cancelar', 'cancelar')]))


def _vigente(data: dict | None, perfil_id: str) -> bool:
    return bool(data and data['perfil'] == perfil_id and time.time() - data['creado'] <= 900)


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
        ctx.user_data[PENDIENTE] = {'nonce': nonce, 'perfil': sus['perfil_id'], 'payload': payload,
                                   'creado': time.time(), 'paso':'tipo', 'servicio_indicado':bool(ctx.args)}
        await update.effective_message.reply_text(
            f'Vamos a preparar tu solicitud para {payload["company"]}. Usaremos los datos de tu cuenta vinculada.\n¿Qué necesitas?',
            reply_markup=_botones(nonce, [('Orientación de un asesor','tipo_advice'), ('Pedir cotización','tipo_quote'), ('Cancelar','cancelar')]))
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
    if not _vigente(pendiente, sus['perfil_id']) or pendiente['nonce'] != nonce:
        await update.effective_message.reply_text('La confirmación venció. Envía /asesor para generar una nueva.')
        return
    if accion == 'cancelar':
        if pendiente.get('confirmada'):
            await update.effective_message.reply_text('La solicitud ya fue confirmada. Consulta /estadoasesoria para revisar su entrega.')
            return
        ctx.user_data.pop(PENDIENTE, None)
        await query.edit_message_text('Solicitud cancelada. No enviamos tus datos al CRM.')
        return
    if accion in ('tipo_advice','tipo_quote') and pendiente['paso'] == 'tipo':
        pendiente['payload']['kind'] = accion.removeprefix('tipo_')
        if pendiente['servicio_indicado']:
            await _pedir_detalle(update,pendiente)
        else:
            pendiente['paso'] = 'servicio'
            await update.effective_message.reply_text('¿Qué certificación o servicio te interesa?', reply_markup=_botones(nonce,
                [(texto,'servicio_' + clave) for clave,texto in SERVICIOS.items()] + [('Cancelar','cancelar')]))
        return
    if accion.startswith('servicio_') and pendiente['paso'] == 'servicio':
        clave = accion.removeprefix('servicio_')
        if clave not in SERVICIOS:
            return
        if clave == 'otro':
            pendiente['paso'] = 'servicio_texto'
            await update.effective_message.reply_text('Escribe la certificación o servicio que necesitas, en un máximo de 160 caracteres.')
        else:
            pendiente['payload']['service'] = SERVICIOS[clave]
            await _pedir_detalle(update,pendiente)
        return
    if accion != 'confirmar' or pendiente['paso'] not in ('resumen','enviada'):
        await update.effective_message.reply_text('Completa el paso actual antes de confirmar. Puedes usar /cancelar para empezar de nuevo.')
        return
    namespace = hashlib.sha256(asesorias.get_settings().telegram_bot_token.encode()).hexdigest()[:8]
    request_id = f'telegram:{namespace}:{sus["perfil_id"]}:{nonce}'
    try:
        pendiente['confirmada'] = True
        resultado = await asesorias.solicitar(request_id, sus['perfil_id'], pendiente['payload'])
        pendiente['paso'] = 'enviada'
        await query.edit_message_text(resultado['mensaje'] + '\nPuedes consultar su entrega con /estadoasesoria.')
    except asesorias.AsesoriaError as error:
        await update.effective_message.reply_text(error.mensaje)
    except OSError:
        await update.effective_message.reply_text('No pudimos confirmar el guardado. Intenta nuevamente con el mismo botón.')


async def texto_asesoria(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> bool:
    data = ctx.user_data.get(PENDIENTE)
    if not data or data.get('paso') not in ('detalle','contacto','servicio_texto'):
        return False
    sus = await _vinculo(update)
    if not sus or not _vigente(data, sus['perfil_id']):
        ctx.user_data.pop(PENDIENTE,None)
        await update.effective_message.reply_text('La solicitud venció. Envía /asesor para comenzar de nuevo.', reply_markup=ReplyKeyboardRemove())
        return True
    text = (update.effective_message.text or '').strip()
    if data['paso'] == 'servicio_texto':
        if not 2 <= len(text) <= 160:
            await update.effective_message.reply_text('Escribe un servicio de entre 2 y 160 caracteres.')
        else:
            data['payload']['service'] = ' '.join(text.split())
            await _pedir_detalle(update,data)
    elif data['paso'] == 'detalle':
        if not 5 <= len(text) <= 1000:
            await update.effective_message.reply_text('Escribe una breve descripción de entre 5 y 1000 caracteres, o usa /omitir.')
        else:
            data['detalle'] = text
            data['payload']['notes'] += '\nNecesidad indicada: ' + text
            await _pedir_contacto(update,data)
    else:
        contacto = update.effective_message.contact
        if contacto and contacto.user_id != update.effective_user.id:
            await update.effective_message.reply_text('Comparte tu propio número o elige «Usar mi correo».')
            return True
        phone = contacto.phone_number if contacto else text
        if text.casefold() == 'usar mi correo' and not contacto:
            data['payload']['phone'] = ''
            await _resumen(update,data)
        elif re.fullmatch(r'[+\d\s()\-]{8,30}', phone) and 8 <= len(re.sub(r'\D','',phone)) <= 15:
            data['payload']['phone'] = phone
            await _resumen(update,data)
        else:
            await update.effective_message.reply_text('Escribe un teléfono válido con código de país, comparte tu contacto o elige «Usar mi correo».')
    return True


async def cmd_omitir(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    data = ctx.user_data.get(PENDIENTE)
    sus = await _vinculo(update)
    if not sus or not _vigente(data, sus['perfil_id']) or data['paso'] != 'detalle':
        await update.effective_message.reply_text('Usa /asesor para preparar una solicitud.')
        return
    await _pedir_contacto(update,data)


async def cmd_cancelar(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    data = ctx.user_data.get(PENDIENTE)
    if data and data.get('confirmada'):
        await update.effective_message.reply_text('La solicitud ya fue confirmada. Consulta /estadoasesoria para revisar su entrega.')
        return
    ctx.user_data.pop(PENDIENTE,None)
    await update.effective_message.reply_text('Solicitud cancelada.', reply_markup=ReplyKeyboardRemove())


async def cmd_estado(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    sus = await _vinculo(update)
    if not sus:
        return
    estado = asesorias.estado_de_solicitud(sus['perfil_id'])
    await update.effective_message.reply_text(estado)


def pide_asesor(texto: str) -> bool:
    return bool(re.fullmatch(r'\s*(?:quiero\s+)?(?:hablar|comunicarme|contactar)(?:\s+con)?\s+(?:un\s+)?asesor[.!?]?\s*', texto, re.I))
