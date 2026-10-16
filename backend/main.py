"""Run locally: python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001."""
from pathlib import Path
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

from .domain import Input, apply_command
from .repository import Conflict, LocalRepository, StorageUnavailable, SupabaseRepository
from .seed import demo_state


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix='CRM_', env_file=Path(__file__).parent / '.env', extra='ignore')
    mode: Literal['demo', 'supabase'] = 'demo'
    origin: str = 'http://127.0.0.1:5174'
    data_file: Path = Path(__file__).parent / 'data' / 'demo.json'
    supabase_url: str = ''
    supabase_secret_key: str = ''
    workspace_id: str = ''
    ingest_key: str = ''


class Command(Input):
    revision: int = Field(ge=0)
    requestId: str = Field(min_length=1, max_length=120)
    operation: str = Field(max_length=40)
    payload: dict


class Event(Input):
    requestId: str = Field(min_length=1, max_length=120)
    payload: dict


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
    repo = repository or (LocalRepository(config.data_file, demo_state()) if config.mode == 'demo'
                          else SupabaseRepository(config.supabase_url, config.supabase_secret_key, config.workspace_id))
    app = FastAPI(title='Lici CRM API', version='0.1.0')
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', 'testserver', urlparse(config.origin).hostname])

    @app.middleware('http')
    async def boundaries(request: Request, call_next):
        if config.mode == 'demo' and request.client and request.client.host not in ['127.0.0.1', '::1', 'testclient']:
            return JSONResponse({'detail': 'El espacio de prueba solo admite acceso local.'}, status_code=403)
        if request.method not in ['GET', 'HEAD', 'OPTIONS']:
            if request.url.path != '/api/crm/events' and request.headers.get('origin') != config.origin:
                return JSONResponse({'detail': 'Origen de solicitud no permitido.'}, status_code=403)
            body = await request.body()
            if len(body) > 65536:
                return JSONResponse({'detail': 'Solicitud demasiado grande.'}, status_code=413)
        response = await call_next(request)
        response.headers.update({'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY'})
        return response

    async def account(request):
        if config.mode == 'demo':
            return {'name': 'Equipo de prueba', 'role': 'admin'}
        token = request.cookies.get('lici_crm_session')
        if not token:
            raise HTTPException(401, 'Inicia sesión con tu cuenta comercial.')
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(config.supabase_url.rstrip('/') + '/auth/v1/user',
                                         headers={'apikey': config.supabase_secret_key, 'Authorization': f'Bearer {token}'})
        if response.status_code != 200:
            raise HTTPException(401, 'Tu sesión venció. Vuelve a ingresar.')
        user = response.json()
        member = await repo.member(user.get('id', ''))
        if not member or member['role'] not in ['admin', 'commercial']:
            raise HTTPException(403, 'Tu cuenta no tiene acceso a este espacio comercial.')
        return {'name': member['display_name'], 'role': member['role']}

    def public(snapshot):
        # Idempotency hashes remain server-side.
        return {'revision': snapshot['revision'], 'data': {k: v for k, v in snapshot['data'].items() if k != 'receipts'}}

    @app.exception_handler(Conflict)
    async def conflict_handler(_request, _error):
        return JSONResponse({'detail': 'Otro cambio se guardó antes. Actualiza los datos y vuelve a guardar.'}, status_code=409)

    @app.exception_handler(StorageUnavailable)
    @app.exception_handler(httpx.HTTPError)
    @app.exception_handler(OSError)
    async def storage_handler(_request, _error):
        return JSONResponse({'detail': 'No se pudo acceder al almacenamiento. Tus cambios no se han confirmado.'}, status_code=503)

    @app.exception_handler(RequestValidationError)
    @app.exception_handler(ValidationError)
    async def validation_handler(_request, error):
        fields = ', '.join('.'.join(str(p) for p in e['loc']) for e in error.errors())
        return JSONResponse({'detail': f'Revisa los campos: {fields}.'}, status_code=422)

    @app.exception_handler(ValueError)
    async def value_handler(_request, error):
        return JSONResponse({'detail': str(error) if len(str(error)) < 300 else 'No se pudo procesar el registro.'}, status_code=422)

    @app.get('/api/crm/session')
    async def session(request: Request):
        return {'mode': config.mode, 'user': await account(request)}

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
        response.set_cookie('lici_crm_session', result['access_token'], httponly=True, secure=True,
                            samesite='strict', max_age=min(result.get('expires_in', 3600), 3600), path='/api/crm')
        return {'ok': True}

    @app.post('/api/crm/logout')
    async def logout(response: Response):
        response.delete_cookie('lici_crm_session', path='/api/crm')
        return {'ok': True}

    @app.get('/api/crm/state')
    async def state(request: Request):
        await account(request)
        return public(await repo.load())

    @app.post('/api/crm/commands')
    async def command(data: Command, request: Request):
        actor = await account(request)
        if data.operation == 'product' and actor['role'] != 'admin':
            raise HTTPException(403, 'Solo administración puede agregar servicios al catálogo.')
        snapshot = await repo.load()
        updated = apply_command(snapshot['data'], data.operation, data.payload, actor['name'], data.requestId)
        if updated is snapshot['data']:
            return public(snapshot)
        if data.revision != snapshot['revision']:
            raise Conflict()
        return public(await repo.save(updated, snapshot['revision']))

    @app.post('/api/crm/events')
    async def event(data: Event, request: Request):
        if not config.ingest_key:
            raise HTTPException(503, 'La recepción de eventos de Lici no está habilitada.')
        supplied = request.headers.get('x-crm-ingest-key', '')
        if not secrets.compare_digest(supplied.encode(), config.ingest_key.encode()):
            raise HTTPException(401, 'Credencial de integración no válida.')
        if data.payload.get('origin') != 'Lici':
            raise HTTPException(422, 'Este canal solo recibe eventos de Lici.')
        for _ in range(3):
            snapshot = await repo.load()
            updated = apply_command(snapshot['data'], 'intake', data.payload, 'Integración Lici', f'lici:{data.requestId}')
            if updated is snapshot['data']:
                return {'accepted': True, 'duplicate': True}
            try:
                await repo.save(updated, snapshot['revision'])
                return {'accepted': True, 'duplicate': False}
            except Conflict:
                continue
        raise Conflict()

    return app


app = create_app()
