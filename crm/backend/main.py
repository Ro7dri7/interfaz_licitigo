"""Run locally: python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001."""
from pathlib import Path
import re
import secrets
from typing import Literal
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .domain import Input, apply_command, hide_admin_data
from .repository import AccessDenied, Conflict, StorageUnavailable, SupabaseRepository, TelegramSchemaMissing
from .relational import RelationalRepository
from .seed import demo_state
from .iso_catalog import metadata, catalog
from .quotations import ISSUER

TEST_ADVISORS = ['Lucía Mendoza (prueba)', 'Diego Salazar (prueba)']


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix='CRM_', env_file=Path(__file__).parent / '.env', extra='ignore')
    mode: Literal['demo', 'supabase'] = 'demo'
    origin: str = 'http://127.0.0.1:5174'
    data_file: Path = Path(__file__).parent / 'data' / 'demo.sqlite3'
    supabase_url: str = ''
    supabase_secret_key: str = ''
    workspace_id: str = ''
    ingest_key: str = ''
    # Hosts del proxy (Nginx, Vercel, n8n). No sustituye a CRM_ORIGIN, que sigue siendo el origen de la sesión.
    allowed_hosts: str = ''


class Command(Input):
    revision: int = Field(ge=0)
    requestId: str = Field(min_length=1, max_length=120)
    operation: str = Field(max_length=40)
    payload: dict


class Event(Input):
    requestId: str = Field(min_length=1, max_length=120)
    payload: dict


class AltaMiembro(Input):
    email: str = Field(min_length=3, max_length=254)
    rol: Literal['admin', 'commercial']
    nombre: str = Field(default='', max_length=100)
    password: str = Field(default='', max_length=72)


class AccesoMiembro(Input):
    usuarioId: str = Field(min_length=8, max_length=80)
    rol: Literal['admin', 'commercial']
    activo: bool


class ClaveMiembro(Input):
    usuarioId: str = Field(min_length=8, max_length=80)
    password: str = Field(min_length=8, max_length=72)


class Login(Input):
    # Password whitespace is significant; never normalize credentials.
    model_config = {'str_strip_whitespace': False}
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


def create_app(settings=None, repository=None):
    config = settings or Settings()
    if config.mode == 'supabase' and not all([config.supabase_url, config.supabase_secret_key, config.workspace_id]):
        raise ValueError('Configura CRM_SUPABASE_URL, CRM_SUPABASE_SECRET_KEY y CRM_WORKSPACE_ID.')
    if config.mode == 'supabase' and (not config.origin.startswith('https://') or not config.supabase_url.startswith('https://')):
        raise ValueError('El modo Supabase requiere HTTPS en CRM_ORIGIN y CRM_SUPABASE_URL.')
    local_path = config.data_file
    legacy = Path(__file__).parent / 'data' / 'demo.json' if local_path == Settings.model_fields['data_file'].default else None
    if local_path.suffix.lower() == '.json':
        legacy, local_path = local_path, local_path.with_suffix('.sqlite3')
    repo = repository or (RelationalRepository(local_path, demo_state(), legacy_path=legacy) if config.mode == 'demo'
                          else SupabaseRepository(config.supabase_url, config.supabase_secret_key, config.workspace_id))
    app = FastAPI(title='LiciHub CRM API', version='0.2.0')
    hosts = ['127.0.0.1', 'localhost', 'testserver', urlparse(config.origin).hostname]
    hosts.extend(host.strip() for host in config.allowed_hosts.split(',') if host.strip())
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=[host for host in hosts if host])

    @app.middleware('http')
    async def boundaries(request: Request, call_next):
        if config.mode == 'demo' and request.client and request.client.host not in ['127.0.0.1', '::1', 'testclient']:
            return JSONResponse({'detail': 'El espacio de prueba solo admite acceso local.'}, status_code=403)
        if request.method not in ['GET', 'HEAD', 'OPTIONS']:
            # logout: SameSite=strict ya limita CSRF; permite salir aunque CRM_ORIGIN aún no apunte a Vercel.
            if request.url.path not in ('/api/crm/events', '/api/crm/logout') and request.headers.get('origin') != config.origin:
                return JSONResponse({'detail': f'Origen de solicitud no permitido. Abre el CRM en {config.origin}. '
                                     'Si cambiaste CRM_ORIGIN en backend/.env, reinicia la API.'}, status_code=403)
            body = await request.body()
            if len(body) > 65536:
                return JSONResponse({'detail': 'Solicitud demasiado grande.'}, status_code=413)
        response = await call_next(request)
        renovacion = getattr(request.state, 'crm_renovacion', None)
        if renovacion:
            _poner_cookies(response, renovacion['access_token'], renovacion.get('refresh_token') or '',
                           int(renovacion.get('expires_in') or 3600))
        response.headers.update({'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY'})
        return response

    def _cabeceras():
        # La API admin de Auth exige la clave secreta también en Authorization.
        clave = config.supabase_secret_key
        return {'apikey': clave, 'Authorization': f'Bearer {clave}'}

    def _json_cuerpo(respuesta):
        try:
            return respuesta.json()
        except ValueError:
            return None

    def _poner_cookies(response, access, refresh, expires_in):
        response.set_cookie('lici_crm_session', access, httponly=True, secure=True, samesite='strict',
                            max_age=min(int(expires_in or 3600), 3600), path='/api/crm')
        if refresh:
            response.set_cookie('lici_crm_refresh', refresh, httponly=True, secure=True, samesite='strict',
                                max_age=60 * 60 * 24 * 14, path='/api/crm')

    def _borrar_cookies(response):
        response.delete_cookie('lici_crm_session', path='/api/crm', secure=True, httponly=True, samesite='strict')
        response.delete_cookie('lici_crm_refresh', path='/api/crm', secure=True, httponly=True, samesite='strict')

    async def account(request):
        if config.mode == 'demo':
            return {'name': 'Equipo de prueba', 'role': 'admin'}
        token = request.cookies.get('lici_crm_session')
        refresh = request.cookies.get('lici_crm_refresh')
        if not token and not refresh:
            raise HTTPException(401, 'Inicia sesión con tu cuenta comercial.')
        user = None
        async with httpx.AsyncClient(timeout=15) as client:
            if token:
                response = await client.get(config.supabase_url.rstrip('/') + '/auth/v1/user',
                                             headers={**_cabeceras(), 'Authorization': f'Bearer {token}'})
                if response.status_code == 200:
                    user = response.json()
            if user is None and refresh:
                renovada = await client.post(config.supabase_url.rstrip('/') + '/auth/v1/token',
                                              params={'grant_type': 'refresh_token'}, headers=_cabeceras(),
                                              json={'refresh_token': refresh})
                if renovada.status_code == 200:
                    datos = renovada.json()
                    request.state.crm_renovacion = datos
                    user = datos.get('user') or {}
        if not user:
            raise HTTPException(401, 'Tu sesión venció. Vuelve a ingresar.')
        member = await repo.member(user.get('id', ''))
        if not member or member['role'] not in ['admin', 'commercial']:
            raise HTTPException(403, 'Tu cuenta no tiene acceso a este espacio comercial.')
        return {'id': user['id'], 'name': member['display_name'], 'role': member['role']}

    def public(snapshot, actor):
        # Idempotency hashes remain server-side. Las propiedades personalizadas son solo para administración.
        data = {k: v for k, v in snapshot['data'].items() if k != 'receipts'}
        if actor['role'] != 'admin':
            data = hide_admin_data(data)
        data['products'] = [p | ({key: m[key] for key in ['sku', 'category', 'isPackage', 'sourceRow']} if (m := metadata(p['id'])) else {})
                            for p in data['products']]
        return {'revision': snapshot['revision'], 'data': data, 'schemaVersion': snapshot.get('schemaVersion', 1)}

    @app.exception_handler(Conflict)
    async def conflict_handler(_request, _error):
        return JSONResponse({'detail': 'Otro cambio se guardó antes. Actualiza los datos y vuelve a guardar.'}, status_code=409)

    @app.exception_handler(AccessDenied)
    async def access_handler(_request, _error):
        return JSONResponse({'detail': 'No tienes permiso para realizar esta operación en el espacio comercial.'}, status_code=403)

    @app.exception_handler(TelegramSchemaMissing)
    async def telegram_schema_handler(_request, _error):
        return JSONResponse({'code': 'crm_telegram_schema_missing',
                             'detail': 'Falta ejecutar 008_origen_telegram.sql en Supabase para aceptar el origen Telegram.'},
                            status_code=503)

    @app.exception_handler(StorageUnavailable)
    @app.exception_handler(httpx.HTTPError)
    @app.exception_handler(OSError)
    async def storage_handler(_request, _error):
        return JSONResponse({'code': 'crm_storage_unavailable',
                             'detail': 'No se pudo acceder al almacenamiento. Tus cambios no se han confirmado.'}, status_code=503)

    @app.exception_handler(RequestValidationError)
    @app.exception_handler(ValidationError)
    async def validation_handler(_request, error):
        fields = ', '.join('.'.join(str(p) for p in e['loc']) for e in error.errors())
        return JSONResponse({'detail': f'Revisa los campos: {fields}.'}, status_code=422)

    @app.exception_handler(ValueError)
    async def value_handler(_request, error):
        return JSONResponse({'detail': str(error) if len(str(error)) < 300 else 'No se pudo procesar el registro.'}, status_code=422)

    async def _asesores():
        if config.mode == 'demo':
            return TEST_ADVISORS
        try:
            miembros = await repo.equipo()
        except StorageUnavailable:
            return []
        return [m['nombre'] for m in miembros if m.get('activo') and m.get('nombre')]

    def _exige_admin(actor):
        if actor.get('role') != 'admin':
            raise HTTPException(403, 'Solo administración puede gestionar el equipo.')

    def _sin_admin_restante(miembros, usuario_id, rol, activo):
        sigue = rol == 'admin' and activo
        otros = [m for m in miembros if m.get('activo') and m.get('rol') == 'admin' and m.get('usuarioId') != usuario_id]
        return not sigue and not otros

    def _clave_fuerte(valor):
        if (len(valor) < 8 or not re.search(r'[A-Z]', valor) or not re.search(r'[a-z]', valor)
                or not re.search(r'\d', valor) or not re.search(r'[!@#$%^&*]', valor)):
            raise HTTPException(422, 'La contraseña necesita 8 caracteres, una mayúscula, una minúscula, un número y un símbolo de !@#$%^&*.')

    async def _auth_admin(method, path, json):
        async with httpx.AsyncClient(timeout=15) as client:
            return await client.request(method, config.supabase_url.rstrip('/') + '/auth/v1' + path,
                                        headers=_cabeceras(), json=json)

    async def _usuario_por_correo(email):
        correo = email.strip().lower()
        async with httpx.AsyncClient(timeout=15) as client:
            respuesta = await client.get(config.supabase_url.rstrip('/') + '/auth/v1/admin/users',
                                         headers=_cabeceras(), params={'filter': correo, 'page': 1, 'per_page': 50})
        if respuesta.status_code >= 400:
            raise HTTPException(503, 'No pudimos consultar las cuentas. Inténtalo de nuevo.')
        cuerpo = _json_cuerpo(respuesta)
        if cuerpo is None:
            raise HTTPException(503, 'Supabase no devolvió las cuentas. Revisa la clave del CRM y vuelve a intentarlo.')
        usuarios = cuerpo.get('users') if isinstance(cuerpo, dict) else cuerpo
        for usuario in usuarios or []:
            if str(usuario.get('email') or '').lower() == correo:
                return usuario
        raise HTTPException(404, 'No hay una cuenta con ese correo. La persona debe registrarse antes.')

    @app.get('/api/crm/session')
    async def session(request: Request):
        actor = await account(request)
        return {'mode': config.mode, 'user': actor, 'advisors': await _asesores(),
                'isoCatalogSize': len(catalog()), 'issuer': ISSUER, 'intakeEnabled': bool(config.ingest_key)}

    @app.get('/api/crm/team')
    async def team(request: Request):
        actor = await account(request)
        _exige_admin(actor)
        return {'members': await repo.equipo()}

    @app.post('/api/crm/team')
    async def team_add(data: AltaMiembro, request: Request):
        actor = await account(request)
        _exige_admin(actor)
        if config.mode == 'demo':
            raise HTTPException(400, 'El espacio de prueba no administra cuentas reales.')
        if data.password:
            _clave_fuerte(data.password)
        try:
            usuario = await _usuario_por_correo(data.email)
        except HTTPException as error:
            if error.status_code != 404:
                raise
            if not data.password:
                raise HTTPException(404, 'No hay una cuenta con ese correo. Indica nombre y contraseña para crearla.') from error
            creado = await _auth_admin('POST', '/admin/users', {
                'email': data.email.strip().lower(), 'password': data.password, 'email_confirm': True,
                'user_metadata': {'nombre': (data.nombre or data.email.split('@')[0])[:100]},
            })
            if creado.status_code >= 400:
                detalle = _json_cuerpo(creado)
                mensaje = ''
                if isinstance(detalle, dict):
                    mensaje = str(detalle.get('msg') or detalle.get('message') or detalle.get('error_description') or '')
                raise HTTPException(422, mensaje or 'No se pudo crear la cuenta. Revisa el correo y la contraseña.')
            usuario = _json_cuerpo(creado) or {}
            if isinstance(usuario, dict) and isinstance(usuario.get('user'), dict):
                usuario = usuario['user']
            if not isinstance(usuario, dict) or not usuario.get('id'):
                usuario = await _usuario_por_correo(data.email)
        else:
            if data.password:
                cambio = await _auth_admin('PUT', f"/admin/users/{usuario['id']}", {'password': data.password})
                if cambio.status_code >= 400:
                    raise HTTPException(422, 'La cuenta existe, pero no se pudo actualizar la contraseña.')
        meta = usuario.get('user_metadata') or {}
        nombre = ' '.join((data.nombre or str(meta.get('nombre') or meta.get('full_name') or meta.get('name')
                                              or data.email.split('@')[0] or 'Asesor')).split())[:100]
        if len(nombre) < 2:
            nombre = 'Asesor'
        await repo.guardar_miembro(usuario['id'], nombre, data.rol, True)
        return {'members': await repo.equipo()}

    @app.post('/api/crm/team/clave')
    async def team_password(data: ClaveMiembro, request: Request):
        actor = await account(request)
        _exige_admin(actor)
        if config.mode == 'demo':
            raise HTTPException(400, 'El espacio de prueba no administra cuentas reales.')
        _clave_fuerte(data.password)
        miembros = await repo.equipo()
        if not any(m.get('usuarioId') == data.usuarioId for m in miembros):
            raise HTTPException(404, 'Esa persona no está en el equipo.')
        cambio = await _auth_admin('PUT', f'/admin/users/{data.usuarioId}', {'password': data.password})
        if cambio.status_code >= 400:
            raise HTTPException(422, 'No se pudo restablecer la contraseña.')
        return {'ok': True}

    @app.post('/api/crm/team/acceso')
    async def team_access(data: AccesoMiembro, request: Request):
        actor = await account(request)
        _exige_admin(actor)
        miembros = await repo.equipo()
        actual = next((m for m in miembros if m.get('usuarioId') == data.usuarioId), None)
        if not actual:
            raise HTTPException(404, 'Esa persona no está en el equipo.')
        if _sin_admin_restante(miembros, data.usuarioId, data.rol, data.activo):
            raise HTTPException(409, 'Debe quedar al menos un administrador activo. No puedes quitarte el acceso si eres el único.')
        await repo.guardar_miembro(data.usuarioId, actual['nombre'], data.rol, data.activo)
        return {'members': await repo.equipo()}

    @app.post('/api/crm/login')
    async def login(data: Login, response: Response):
        if config.mode == 'demo':
            raise HTTPException(400, 'El espacio de prueba no utiliza cuentas reales.')
        async with httpx.AsyncClient(timeout=15) as client:
            auth = await client.post(config.supabase_url.rstrip('/') + '/auth/v1/token', params={'grant_type': 'password'},
                                     headers={'apikey': config.supabase_secret_key}, json=data.model_dump())
        if auth.status_code != 200:
            raise HTTPException(401, 'No pudimos iniciar sesión. Revisa tus credenciales.')
        result = auth.json()
        member = await repo.member(result['user']['id'])
        if not member or member['role'] not in ['admin', 'commercial']:
            raise HTTPException(403, 'Esta cuenta no tiene acceso comercial.')
        _poner_cookies(response, result['access_token'], result.get('refresh_token') or '',
                       int(result.get('expires_in') or 3600))
        return {'ok': True}

    @app.post('/api/crm/logout')
    async def logout(response: Response):
        _borrar_cookies(response)
        return {'ok': True}

    @app.get('/api/crm/state')
    async def state(request: Request):
        actor = await account(request)
        return public(await repo.load(), actor)

    @app.post('/api/crm/commands')
    async def command(data: Command, request: Request):
        actor = await account(request)
        if data.operation in ['product', 'import_iso'] and actor['role'] != 'admin':
            raise HTTPException(403, 'Solo administración puede agregar servicios al catálogo.')
        if data.operation.startswith('property_') and actor['role'] != 'admin':
            raise HTTPException(403, 'Solo administración puede crear y editar propiedades.')
        if data.operation == 'assign_company_owner' and actor['role'] != 'admin':
            raise HTTPException(403, 'Solo administración puede asignar el comercial de una empresa.')
        snapshot = await repo.load(request_id=data.requestId)
        if data.operation.startswith('property_') and snapshot.get('schemaVersion', 1) < 3:
            raise HTTPException(503, 'Falta ejecutar 010_propiedades.sql en Supabase para habilitar las propiedades personalizadas.')
        if data.operation in ['quote', 'quote_status'] and snapshot.get('schemaVersion', 1) < 2:
            raise HTTPException(503, 'Falta ejecutar 006_cotizaciones_multiples.sql en Supabase para habilitar las nuevas propuestas.')
        updated = apply_command(snapshot['data'], data.operation, data.payload, actor['name'], data.requestId)
        if updated is snapshot['data']:
            return public(snapshot, actor)
        if data.revision != snapshot['revision']:
            raise Conflict()
        return public(await repo.save(updated, snapshot['revision'], before=snapshot, actor=actor), actor)

    @app.post('/api/crm/events')
    async def event(data: Event, request: Request):
        if not config.ingest_key:
            return JSONResponse({'code': 'crm_ingest_disabled',
                                 'detail': 'La recepción de eventos de Lici no está habilitada. Configura CRM_INGEST_KEY.'},
                                status_code=503)
        supplied = request.headers.get('x-crm-ingest-key', '')
        if not secrets.compare_digest(supplied.encode(), config.ingest_key.encode()):
            raise HTTPException(401, 'Credencial de integración no válida.')
        if data.payload.get('origin') not in ['Lici', 'Telegram']:
            raise HTTPException(422, 'Este canal solo recibe solicitudes del portal o Telegram.')
        if data.payload.get('kind') not in ['advice', 'quote']:
            raise HTTPException(422, 'Solo se registran solicitudes explícitas de asesoría o cotización.')
        for _ in range(3):
            snapshot = await repo.load(request_id=f'lici:{data.requestId}')
            updated = apply_command(snapshot['data'], 'intake', data.payload, f'Integración {data.payload["origin"]}', f'lici:{data.requestId}')
            if updated is snapshot['data']:
                return {'accepted': True, 'duplicate': True}
            try:
                await repo.save(updated, snapshot['revision'], before=snapshot, integration=True)
                return {'accepted': True, 'duplicate': False}
            except Conflict:
                continue
        raise Conflict()

    return app


app = create_app()
