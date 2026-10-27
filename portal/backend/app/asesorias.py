"""Solicitudes explícitas de asesoría y entrega persistente al CRM."""
from contextlib import closing
import hashlib
import json
import logging
from pathlib import Path
import re
import sqlite3
import time

import httpx

from .config import get_settings
from .supabase import get_db

log = logging.getLogger(__name__)
SERVICIO_GENERAL = 'Asesoría certificaciones ISO'


class AsesoriaError(Exception):
    def __init__(self, status: int, mensaje: str):
        super().__init__(mensaje)
        self.status, self.mensaje = status, mensaje


def comprobar_configuracion() -> None:
    config = get_settings()
    if not config.crm_api_url or not config.crm_ingest_key:
        raise AsesoriaError(503, 'La atención comercial todavía no está habilitada. Inténtalo más tarde.')


class ColaAsesorias:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self.conectar()) as db, db:
            db.execute('''create table if not exists solicitudes (
                id text primary key, perfil_id text not null, huella text not null,
                evento text not null, estado text not null default 'pendiente',
                intentos integer not null default 0, proximo_intento real not null default 0,
                ultimo_error text not null default '', creado_en real not null)''')

    def conectar(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def registrar(self, request_id: str, perfil_id: str, payload: dict) -> None:
        evento = json.dumps({'requestId': request_id, 'payload': payload}, sort_keys=True, ensure_ascii=False)
        huella = hashlib.sha256(evento.encode()).hexdigest()
        with closing(self.conectar()) as db, db:
            db.execute('insert or ignore into solicitudes(id,perfil_id,huella,evento,creado_en) values(?,?,?,?,?)',
                       (request_id, perfil_id, huella, evento, time.time()))
            fila = db.execute('select huella from solicitudes where id=?', (request_id,)).fetchone()
            if fila['huella'] != huella:
                raise AsesoriaError(409, 'Esta solicitud ya se registró con otros datos.')

    def obtener(self, request_id: str):
        with closing(self.conectar()) as db:
            fila = db.execute('select * from solicitudes where id=?', (request_id,)).fetchone()
            return dict(fila) if fila else None

    def actualizar(self, request_id: str, estado: str, error: str = '') -> None:
        with closing(self.conectar()) as db, db:
            intentos = db.execute('select intentos from solicitudes where id=?', (request_id,)).fetchone()['intentos'] + 1
            db.execute("update solicitudes set estado=?,intentos=?,ultimo_error=?,proximo_intento=?,evento=case when ?='entregada' then '' else evento end where id=? and estado='pendiente'",
                       (estado, intentos, error, time.time() + min(3600, 15 * 2 ** min(intentos, 8)), estado, request_id))

    def pendientes(self, *, ignorar_espera=False) -> list[str]:
        with closing(self.conectar()) as db:
            return [r['id'] for r in db.execute("select id from solicitudes where estado='pendiente' and (? or proximo_intento<=?) order by creado_en limit 20", (ignorar_espera,time.time()))]

    def ultima_de_perfil(self, perfil_id: str) -> dict | None:
        with closing(self.conectar()) as db:
            fila = db.execute('select id,estado from solicitudes where perfil_id=? order by creado_en desc limit 1', (perfil_id,)).fetchone()
            return dict(fila) if fila else None

    def reactivar(self, request_id: str) -> None:
        with closing(self.conectar()) as db, db:
            db.execute("update solicitudes set estado='pendiente',proximo_intento=0 where id=? and estado='error'", (request_id,))

    def resumen(self) -> list[dict]:
        with closing(self.conectar()) as db:
            return [dict(r) for r in db.execute('select id,estado,intentos,ultimo_error from solicitudes order by creado_en desc limit 50')]


async def entregar(request_id: str, *, transport=None) -> str:
    comprobar_configuracion()
    config = get_settings()
    cola = ColaAsesorias(config.crm_outbox_file)
    fila = cola.obtener(request_id)
    if not fila:
        raise AsesoriaError(404, 'Solicitud no encontrada.')
    if fila['estado'] != 'pendiente':
        return fila['estado']
    try:
        async with httpx.AsyncClient(timeout=10, transport=transport, follow_redirects=False, trust_env=False) as http:
            respuesta = await http.post(config.crm_api_url + '/api/crm/events',
                                        headers={'X-CRM-Ingest-Key': config.crm_ingest_key, 'Content-Type': 'application/json'},
                                        content=fila['evento'].encode())
        try:
            resultado = respuesta.json()
        except ValueError:
            resultado = None
        if respuesta.status_code == 200 and isinstance(resultado, dict) and resultado.get('accepted') is True and isinstance(resultado.get('duplicate'), bool):
            cola.actualizar(request_id, 'entregada')
            return 'entregada'
        reintentable = respuesta.status_code in (409, 429) or respuesta.status_code >= 500 or respuesta.status_code == 200
        estado = 'pendiente' if reintentable else 'error'
        codes = {'crm_ingest_disabled', 'crm_storage_unavailable', 'crm_telegram_schema_missing'}
        code = resultado.get('code') if isinstance(resultado, dict) else None
        motivo = f'HTTP {respuesta.status_code}' + (f': {code}' if code in codes else '')
        cola.actualizar(request_id, estado, motivo)
        log.warning('Entrega CRM %s: %s, HTTP %s', request_id, estado, respuesta.status_code)
        return estado
    except httpx.HTTPError:
        cola.actualizar(request_id, 'pendiente', 'Conexión no disponible')
        return 'pendiente'


async def reintentar_pendientes() -> None:
    config = get_settings()
    if not config.crm_api_url or not config.crm_ingest_key or not config.crm_outbox_file.exists():
        return
    for request_id in ColaAsesorias(config.crm_outbox_file).pendientes():
        await entregar(request_id)


def estado_de_solicitud(perfil_id: str) -> str:
    path = get_settings().crm_outbox_file
    fila = ColaAsesorias(path).ultima_de_perfil(perfil_id) if path.exists() else None
    if not fila:
        return 'Todavía no tienes solicitudes confirmadas en este bot. Usa /asesor para preparar una.'
    referencia = hashlib.sha256(fila['id'].encode()).hexdigest()[:8].upper()
    textos = {'entregada':'El CRM recibió tu solicitud y el equipo comercial puede darle seguimiento.',
              'pendiente':'Tu solicitud está guardada y pendiente de entrega al CRM. No necesitas volver a enviarla.',
              'error':'Tu solicitud está guardada. El equipo debe revisar su entrega al CRM; no necesitas repetirla.'}
    return f'Solicitud {referencia}: {textos[fila["estado"]]}'


async def diagnostico(*, transport=None) -> dict:
    config = get_settings()
    if not config.crm_api_url or not config.crm_ingest_key:
        return {'codigo':'emisor_sin_configurar', 'mensaje':'Falta CRM_API_URL o CRM_INGEST_KEY en el backend del portal.'}
    try:
        async with httpx.AsyncClient(timeout=10,transport=transport,follow_redirects=False,trust_env=False) as http:
            response = await http.post(config.crm_api_url + '/api/crm/events',
                headers={'X-CRM-Ingest-Key':config.crm_ingest_key},
                json={'requestId':'diagnostico-sin-escritura','payload':{'origin':'Lici','kind':'diagnostic'}})
        if response.status_code == 422:
            return {'codigo':'recepcion_habilitada','mensaje':'El CRM acepta la clave de integración. No se crearon registros; el almacenamiento no se probó.'}
        if response.status_code == 401:
            return {'codigo':'claves_no_coinciden','mensaje':'CRM_INGEST_KEY debe coincidir en ambos backend/.env. Reinicia los dos procesos después de cambiarla.'}
        if response.status_code == 503:
            return {'codigo':'receptor_no_disponible','mensaje':'Comprueba Recepción habilitada en el CRM. Si está deshabilitada, configura CRM_INGEST_KEY y reinicia su API.'}
        return {'codigo':'respuesta_inesperada','http':response.status_code,'mensaje':'Revisa CRM_API_URL: debe apuntar a la API del CRM.'}
    except httpx.HTTPError:
        return {'codigo':'sin_conexion','mensaje':'No hay conexión con la API del CRM. Revisa el servidor y CRM_API_URL.'}


async def preparar(perfil_id: str, email: str, origen: str, *, servicio: str = SERVICIO_GENERAL,
                   licitacion_id: int | None = None, username: str | None = None) -> dict:
    comprobar_configuracion()
    db = get_db()
    perfiles = await db.select('perfiles', {'select': 'id,ruc_empresa,nombre_completo', 'id': f'eq.{perfil_id}'}, limit=1)
    perfil = perfiles[0] if perfiles else {}
    ruc = perfil.get('ruc_empresa') or ''
    if not re.fullmatch(r'\d{11}', ruc):
        raise AsesoriaError(409, 'Completa el RUC de tu empresa en Mi perfil antes de pedir asesoría.')
    proveedores = await db.select('proveedores', {'select': 'razon_social', 'ruc': f'eq.{ruc}'}, limit=1)
    empresa = (proveedores[0].get('razon_social') if proveedores else None) or f'Empresa RUC {ruc}'
    notas = ['El cliente solicitó comunicarse con un asesor.', f'Cuenta del portal: {perfil_id}']
    if username and re.fullmatch(r'[A-Za-z0-9_]{5,32}', username):
        notas.append(f'Contacto Telegram: https://t.me/{username}')
    tender = ''
    if licitacion_id is not None:
        filas = await db.select('desbloqueos', {'select': 'convocatoria_id,convocatorias(nomenclatura_norm,licitacion)',
                                'perfil_id': f'eq.{perfil_id}', 'convocatoria_id': f'eq.{licitacion_id}'}, limit=1)
        if not filas:
            raise AsesoriaError(403, 'Primero debes desbloquear esta licitación con tu cuenta.')
        convocatoria = filas[0].get('convocatorias') or {}
        tender = (convocatoria.get('nomenclatura_norm') or convocatoria.get('licitacion') or str(licitacion_id))[:160]
        notas.append(f'Licitación desbloqueada: {tender}')
    return dict(company=empresa[:160], ruc=ruc, contact=(perfil.get('nombre_completo') or 'Cliente del portal')[:100],
                email=email, origin=origen, kind='advice', service=servicio[:160], evidence='none',
                tender=tender, notes='\n'.join(notas))


async def solicitar(request_id: str, perfil_id: str, payload: dict) -> dict:
    comprobar_configuracion()
    try:
        cola = ColaAsesorias(get_settings().crm_outbox_file)
        cola.registrar(request_id, perfil_id, payload)
        estado = await entregar(request_id)
    except (sqlite3.Error, OSError) as error:
        raise AsesoriaError(503, 'No pudimos confirmar el guardado. Reintenta la misma solicitud.') from error
    if estado == 'error':
        raise AsesoriaError(503, 'Tu solicitud está guardada, pero requiere revisión del equipo para entregarla.')
    return {'solicitudId': request_id, 'estado': estado, 'mensaje': (
        'El equipo comercial recibió tu solicitud. Un asesor se pondrá en contacto contigo.' if estado == 'entregada' else
        'Tu solicitud está guardada y pendiente de entrega al equipo comercial. No necesitas volver a enviarla.')}


if __name__ == '__main__':
    import argparse
    import asyncio

    parser = argparse.ArgumentParser(description='Estado y recuperación de la cola comercial. No muestra datos de contacto.')
    parser.add_argument('accion', choices=['estado', 'reintentar', 'diagnostico', 'reintentar-pendientes'])
    parser.add_argument('solicitud_id', nargs='?')
    args = parser.parse_args()
    if args.accion == 'diagnostico':
        print(json.dumps(asyncio.run(diagnostico()),ensure_ascii=False,indent=2))
    elif args.accion == 'reintentar-pendientes':
        cola = ColaAsesorias(get_settings().crm_outbox_file)
        async def recuperar():
            return [await entregar(request_id) for request_id in cola.pendientes(ignorar_espera=True)]
        resultados = asyncio.run(recuperar())
        print(json.dumps({estado:resultados.count(estado) for estado in ['entregada','pendiente','error']},ensure_ascii=False))
    elif args.accion == 'reintentar':
        cola = ColaAsesorias(get_settings().crm_outbox_file)
        if not args.solicitud_id:
            parser.error('Indica el identificador de la solicitud guardada.')
        cola.reactivar(args.solicitud_id)
        print(asyncio.run(entregar(args.solicitud_id)))
    else:
        cola = ColaAsesorias(get_settings().crm_outbox_file)
        print(json.dumps(cola.resumen(), ensure_ascii=False, indent=2))
