"""
Bot de Telegram de Lici. Ejecutar con:  python -m app.bot

- /start <token>  liga el chat a una cuenta web (enlace generado en la web: onboarding o Mi perfil). El RUC es el
                  de esa cuenta; el bot no registra empresas por su cuenta (una empresa por cuenta).
- Cada ALERT_INTERVAL_MIN minutos revisa la BD y avisa de licitaciones vigentes nuevas que calzan con el perfil.
"""

import html
import logging
import re
import sys
from datetime import timedelta

from telegram import BotCommand, InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.error import Forbidden
from telegram.ext import Application, CallbackQueryHandler, CommandHandler, ContextTypes, MessageHandler, filters

from . import licitaciones, suscripciones
from .config import get_settings
from .supabase import get_db
from . import asesorias, bot_asesorias

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("lici.bot")

COMANDOS = [
    ("asesor", "Solicitar contacto de un asesor comercial"),
    ("licitaciones", "Licitaciones vigentes que calzan con tu perfil"),
    ("nuevas", "Publicadas en las últimas 24 horas para tu perfil"),
    ("buscar", "Buscar en la BD: /buscar cemento portland"),
    ("resumen", "Datos que tenemos en la base de datos"),
    ("keywords", "Ver tus keywords de alerta"),
    ("agregar", "Agregar keyword: /agregar tubo de acero"),
    ("quitar", "Quitar keyword: /quitar 2"),
    ("pausar", "Pausar las alertas"),
    ("reanudar", "Reanudar las alertas"),
    ("ayuda", "Ver todos los comandos"),
]


def _e(s: object) -> str:
    return html.escape(str(s or ""))


def _soles(monto: float) -> str:
    return f"S/ {monto:,.2f}"


def _url_ok(url: str | None) -> bool:
    return bool(url) and str(url).startswith(("http://", "https://"))


def _cierre(lic: dict) -> str:
    if not lic.get("fechaLimite"):
        return ""
    f = lic["fechaLimite"]  # ISO en hora de Lima (licitaciones.a_licitacion)
    return f" · ⏳ Cierra {f[8:10]}/{f[5:7]} {f[11:16]}"


def formato_licitacion(lic: dict, compacto: bool = False) -> str:
    titulo = lic["titulo"]
    max_len = 180 if compacto else 400
    if len(titulo) > max_len:
        titulo = titulo[:max_len].rstrip() + "…"
    codigo = f'<a href="{_e(lic["fichaUrl"])}">{_e(lic["codigo"])}</a>' if compacto and _url_ok(lic.get("fichaUrl")) \
        else f"<b>{_e(lic['codigo'])}</b>"
    lineas = [
        f"{'🆕 ' if lic['esNueva'] else ''}{codigo} · {_e(lic['objeto'])}",
        _e(titulo),
        f"🏛 {_e(lic['entidad'])}",
        f"📍 {_e(lic['departamento'].title())} · 📅 {_e(lic['publicacion'])}{_cierre(lic)}",
    ]
    if lic["valorReferencial"] > 0:
        lineas.append(f"💰 {_soles(lic['valorReferencial'])}")
    if lic.get("matchPorcentaje"):
        motivo = f" — {_e(lic['motivos'][0])}" if lic.get("motivos") else ""
        lineas.append(f"🎯 Afinidad {lic['matchPorcentaje']}%{motivo}")
    return "\n".join(lineas)


def boton_ficha(lic: dict) -> InlineKeyboardMarkup | None:
    if not _url_ok(lic.get("fichaUrl")):
        return None
    return InlineKeyboardMarkup([[InlineKeyboardButton("Ver ficha en SEACE", url=lic["fichaUrl"])]])


async def responder(update: Update, texto: str) -> None:
    await update.effective_message.reply_text(texto, parse_mode=ParseMode.HTML, disable_web_page_preview=True)


async def enviar_lista(update: Update, titulo: str, lics: list[dict], vacio: str) -> None:
    if not lics:
        await responder(update, vacio)
        return
    bloques = [titulo]
    for lic in lics:
        bloque = formato_licitacion(lic, compacto=True)
        if sum(len(b) for b in bloques) + len(bloque) > 3800:  # límite de 4096 caracteres por mensaje
            await responder(update, "\n\n".join(bloques))
            bloques = []
        bloques.append(bloque)
    await responder(update, "\n\n".join(bloques))


def perfil_de(sus: dict) -> licitaciones.Perfil:
    return licitaciones.Perfil(sus.get("keywords") or [], sus.get("ciius") or [], ruc=sus.get("ruc"))


MENSAJE_VINCULAR = (
    "Para recibir alertas, conecta este chat con tu cuenta de Lici:\n"
    "1. Entra a la web con tu cuenta.\n"
    "2. Ve a <b>Mi perfil → Alertas por Telegram</b> y pulsa <b>Conectar Telegram</b>.\n"
    "3. Abre el enlace y pulsa <b>Iniciar</b>.\n\n"
    "Las alertas usan el RUC registrado en tu cuenta; no se pueden consultar otras empresas desde aquí."
)


async def _sin_suscripcion(update: Update) -> None:
    await responder(update, MENSAJE_VINCULAR)


async def _bienvenida_con_vigentes(update: Update, sus: dict) -> None:
    """Muestra lo que ya está abierto y lo marca como avisado: desde aquí solo llegan las nuevas."""
    vigentes = await licitaciones.buscar(perfil_de(sus), limite=500)
    await suscripciones.marcar_enviadas(update.effective_chat.id, [l["id"] for l in vigentes])
    await enviar_lista(
        update,
        f"📋 Hoy hay <b>{len(vigentes)}</b> licitaciones vigentes para tu perfil. Las de mayor afinidad:",
        vigentes[:5],
        "Por ahora no hay licitaciones vigentes con tus keywords. Te aviso apenas salga una.",
    )


# ----------------------------------------------------------------------------- comandos

async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    chat, user = update.effective_chat, update.effective_user
    if ctx.args:
        sus, motivo = await suscripciones.vincular(ctx.args[0], chat.id, user.username if user else None)
        if not sus:
            await responder(update, {
                "usado": "Ese enlace ya se usó en otro chat. Genera uno nuevo desde <b>Mi perfil</b> en la web.",
                "vencido": "Ese enlace venció (dura 24 horas). Genera uno nuevo desde <b>Mi perfil</b> en la web.",
            }.get(motivo, "Ese enlace no es válido. Genera uno nuevo desde <b>Mi perfil</b> en la web."))
            return
        kws = ", ".join(_e(k) for k in sus["keywords"]) or "—"
        await responder(update, f"✅ Alertas activadas para <b>{_e(sus.get('razon_social') or sus.get('ruc'))}</b>.\n"
                                f"🏷️ Keywords: {kws}\n\nTe escribiré cuando se publique una licitación nueva que calce.")
        await _bienvenida_con_vigentes(update, sus)
        await responder(update, 'Si necesitas orientación comercial, envía <b>/asesor</b> para solicitar contacto del equipo LiciHub.')
        return

    sus = await suscripciones.de_chat(chat.id)
    if sus:
        await responder(update, f"Hola de nuevo 👋 Sigo vigilando el SEACE para "
                                f"<b>{_e(sus.get('razon_social') or sus.get('ruc'))}</b>. Usa /ayuda para ver comandos.")
    else:
        await responder(update, "👋 Soy <b>Lici</b>, te aviso de licitaciones del Estado (SEACE) para tu rubro.\n\n"
                        + MENSAJE_VINCULAR)


async def cmd_licitaciones(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    sus = await suscripciones.de_chat(update.effective_chat.id, incluir_pausadas=True)
    if not sus:
        return await _sin_suscripcion(update)
    lics = await licitaciones.buscar(perfil_de(sus), limite=10)
    await enviar_lista(update, "📋 <b>Licitaciones vigentes para tu perfil</b> (mayor afinidad primero):", lics,
                       "No hay licitaciones vigentes con tus keywords ahora mismo. Prueba /agregar otra keyword.")


async def cmd_nuevas(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    sus = await suscripciones.de_chat(update.effective_chat.id, incluir_pausadas=True)
    if not sus:
        return await _sin_suscripcion(update)
    desde = licitaciones.ahora_lima() - timedelta(hours=24)
    lics = await licitaciones.buscar(perfil_de(sus), desde=desde, limite=10)
    await enviar_lista(update, "🆕 <b>Publicadas en las últimas 24 h para tu perfil:</b>", lics,
                       "Nada nuevo para tu perfil en las últimas 24 horas.")


async def cmd_buscar(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    texto = " ".join(ctx.args or []).strip()
    if not texto:
        await responder(update, "Escribe qué buscar, por ejemplo: <code>/buscar cemento portland</code>")
        return
    lics = await licitaciones.buscar(texto=texto, limite=10)
    await enviar_lista(update, f"🔎 Vigentes que mencionan <b>{_e(texto)}</b>:", lics,
                       f"No encontré licitaciones vigentes con «{_e(texto)}».")


async def cmd_resumen(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    s = await licitaciones.estadisticas()
    fuentes = " · ".join(f"{_e(k)}: {v:,}" for k, v in s["porFuente"].items())
    objetos = "\n".join(f"  • {_e(k)}: {v:,}" for k, v in s["vigentesPorObjeto"].items())
    deptos = "\n".join(f"  • {_e(k.title())}: {v:,}" for k, v in s["vigentesPorDepartamento"].items())
    entidades = "\n".join(f"  • {_e(k)} ({v})" for k, v in s["topEntidades"])
    act = s["ultimaActualizacion"] or ""
    await responder(update, (
        "📊 <b>Base de datos Lici (SEACE)</b>\n\n"
        f"Convocatorias registradas: <b>{s['totalConvocatorias']:,}</b>\n"
        f"Vigentes hoy: <b>{s['vigentes']:,}</b> · nuevas en 24 h: <b>{s['nuevas24h']:,}</b>\n"
        f"Monto referencial vigente: <b>{_soles(s['montoVigente'])}</b> "
        f"(de {s['vigentesConMonto']:,} con monto publicado)\n"
        f"Por fuente: {fuentes}\n"
        f"Procesos con ítems CUBSO: {s['procesosConItems']:,} · proveedores: {s['proveedores']:,}\n"
        f"Catálogo CUBSO→CIIU: {s['catalogoCubsoCiiu']:,} ítems\n\n"
        f"<b>Vigentes por objeto</b>\n{objetos}\n\n"
        f"<b>Vigentes por departamento (top 10)</b>\n{deptos}\n\n"
        f"<b>Entidades con más procesos vigentes</b>\n{entidades}\n\n"
        f"Última sincronización: {_e(act[:16].replace('T', ' '))} UTC"
    ))


async def cmd_keywords(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    sus = await suscripciones.de_chat(update.effective_chat.id, incluir_pausadas=True)
    if not sus:
        return await _sin_suscripcion(update)
    kws = "\n".join(f"  {i}. {_e(k)}" for i, k in enumerate(sus["keywords"], 1)) or "  (ninguna)"
    estado = "activas ✅" if sus["activo"] else "en pausa ⏸"
    await responder(update, f"🏷️ <b>Tus keywords</b> — alertas {estado}\n{kws}\n\n"
                            "Usa <code>/agregar texto</code> o <code>/quitar número</code>.")


async def cmd_agregar(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    sus = await suscripciones.de_chat(update.effective_chat.id, incluir_pausadas=True)
    if not sus:
        return await _sin_suscripcion(update)
    kw = " ".join(ctx.args or []).strip().upper()
    if not kw:
        await responder(update, "Ejemplo: <code>/agregar tubo de acero</code>")
        return
    if len(kw) < 3:
        await responder(update, "La keyword debe tener al menos 3 letras.")
        return
    if len(sus["keywords"]) >= 30 and kw not in sus["keywords"]:
        await responder(update, "Puedes tener hasta 30 keywords. Quita alguna con /quitar.")
        return
    if kw not in sus["keywords"]:
        await suscripciones.actualizar_keywords(sus, [*sus["keywords"], kw[:80]])
    await responder(update, f"➕ Agregada: <b>{_e(kw)}</b> (también en tu cuenta web). Ver todas con /keywords")


async def cmd_quitar(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    sus = await suscripciones.de_chat(update.effective_chat.id, incluir_pausadas=True)
    if not sus:
        return await _sin_suscripcion(update)
    arg = " ".join(ctx.args or []).strip()
    kws = list(sus["keywords"])
    if arg.isdigit() and 1 <= int(arg) <= len(kws):
        quitada = kws.pop(int(arg) - 1)
    elif arg.upper() in kws:
        quitada = arg.upper()
        kws.remove(quitada)
    else:
        await responder(update, "Indica el número de la keyword (míralo en /keywords), ej: <code>/quitar 2</code>")
        return
    await suscripciones.actualizar_keywords(sus, kws)
    await responder(update, f"➖ Quitada: <b>{_e(quitada)}</b> (también de tu cuenta web)")


async def _set_activo(update: Update, activo: bool) -> None:
    sus = await suscripciones.de_chat(update.effective_chat.id, incluir_pausadas=True)
    if not sus:
        return await _sin_suscripcion(update)
    await suscripciones.actualizar(sus["id"], activo=activo)
    await responder(update, "▶️ Alertas reanudadas." if activo else "⏸ Alertas en pausa. Vuelve con /reanudar.")


async def cmd_pausar(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    await _set_activo(update, False)


async def cmd_reanudar(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    await _set_activo(update, True)


async def cmd_ruc_deshabilitado(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    """/ruc ya no existe: la empresa se registra una sola vez en la cuenta web."""
    await responder(update, "Este comando ya no está disponible. " + MENSAJE_VINCULAR)


async def cmd_ayuda(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    await responder(update, "<b>Comandos de Lici</b>\n" + "\n".join(f"/{c} — {_e(d)}" for c, d in COMANDOS))


async def texto_libre(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if bot_asesorias.pide_asesor(update.effective_message.text or ''):
        ctx.args = []
        await bot_asesorias.cmd_asesor(update, ctx)
        return
    digitos = re.sub(r"\D", "", update.effective_message.text or "")
    if len(digitos) == 11:
        await responder(update, "El RUC se registra una sola vez en tu cuenta de la web y no se puede consultar ni "
                                "cambiar desde el bot.\n\n" + MENSAJE_VINCULAR)
    else:
        await responder(update, "No entendí 🤔. Usa /ayuda para ver los comandos.")


# ----------------------------------------------------------------------------- alertas periódicas

async def revisar_nuevas(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    s = get_settings()
    subs = await suscripciones.activas()
    if not subs:
        return
    total = 0
    for sus in subs:
        chat_id = sus["chat_id"]
        try:
            vigentes = await licitaciones.buscar(perfil_de(sus), limite=500)
            ya = await suscripciones.enviadas(chat_id)
            nuevas = [l for l in vigentes if l["id"] not in ya]
            if not nuevas:
                continue
            extra = f" Te muestro las {s.alert_max_por_envio} de mayor afinidad; el resto en /licitaciones." \
                if len(nuevas) > s.alert_max_por_envio else ""
            await ctx.bot.send_message(chat_id, f"🔔 <b>{len(nuevas)} licitación(es) nueva(s)</b> para "
                                                f"{_e(sus.get('razon_social') or 'tu perfil')}.{extra}",
                                       parse_mode=ParseMode.HTML)
            for lic in nuevas[: s.alert_max_por_envio]:
                await ctx.bot.send_message(chat_id, formato_licitacion(lic), parse_mode=ParseMode.HTML,
                                           reply_markup=boton_ficha(lic), disable_web_page_preview=True)
            await suscripciones.marcar_enviadas(chat_id, [l["id"] for l in nuevas])
            await suscripciones.actualizar(sus["id"], ultimo_aviso_at=licitaciones.ahora_lima().isoformat())
            total += len(nuevas)
        except Forbidden:
            log.info("El chat %s bloqueó el bot; se desactiva la suscripción", chat_id)
            await suscripciones.actualizar(sus["id"], activo=False)
        except Exception:
            log.exception("Error avisando al chat %s", chat_id)
    log.info("Ronda de alertas: %d suscripciones, %d avisos", len(subs), total)


async def post_init(app: Application) -> None:
    if not await get_db().existe_tabla(suscripciones.TABLA):
        raise RuntimeError("Faltan las tablas de suscripciones del bot en la base de datos.")
    await app.bot.set_my_commands([BotCommand(c, d) for c, d in COMANDOS])
    me = await app.bot.get_me()
    log.info("Bot @%s listo. Revisión de nuevas licitaciones cada %d min.", me.username, get_settings().alert_interval_min)


async def post_shutdown(_: Application) -> None:
    await get_db().close()


async def reintentar_asesorias(_: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        await asesorias.reintentar_pendientes()
    except Exception:
        log.error('No se pudo procesar la cola comercial. Revisa almacenamiento y configuración.')


def main() -> None:
    s = get_settings()
    if not s.telegram_bot_token:
        sys.exit("Falta TELEGRAM_BOT_TOKEN en backend/.env (créalo con @BotFather en Telegram).")

    app = Application.builder().token(s.telegram_bot_token).post_init(post_init).post_shutdown(post_shutdown).build()
    handlers = {
        "asesor": bot_asesorias.cmd_asesor,
        "start": cmd_start, "ruc": cmd_ruc_deshabilitado, "licitaciones": cmd_licitaciones, "nuevas": cmd_nuevas,
        "buscar": cmd_buscar, "resumen": cmd_resumen, "keywords": cmd_keywords, "agregar": cmd_agregar,
        "quitar": cmd_quitar, "pausar": cmd_pausar, "reanudar": cmd_reanudar, "ayuda": cmd_ayuda, "help": cmd_ayuda,
    }
    for nombre, fn in handlers.items():
        app.add_handler(CommandHandler(nombre, fn))
    app.add_handler(CallbackQueryHandler(bot_asesorias.confirmar_asesoria, pattern=r'^asesoria:(confirmar|cancelar):[a-f0-9]{16}$'))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, texto_libre))
    app.job_queue.run_repeating(revisar_nuevas, interval=s.alert_interval_min * 60, first=30)
    app.job_queue.run_repeating(reintentar_asesorias, interval=30, first=5)
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
