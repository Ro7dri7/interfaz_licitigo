"""Prueba ambos servidores y la confirmación del bot usando datos temporales, sin acceder a Telegram ni Supabase."""
import argparse
import asyncio
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx


async def probar(crm_path: Path):
    portal = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(portal / 'backend'))
    sys.path.insert(0, str(crm_path))
    from app import asesorias, bot_asesorias
    from app.auth import Usuario, usuario_actual
    from app.config import Settings as PortalSettings
    from backend.domain import empty_state
    from backend.main import Settings as CRMSettings, create_app
    from backend.relational import RelationalRepository

    with tempfile.TemporaryDirectory() as directory:
        config = PortalSettings(_env_file=None, supabase_url='https://supabase.example',
            supabase_secret_key='test-only', apimigo_token='test-only', telegram_bot_token='test-only',
            crm_api_url='http://127.0.0.1:8001', crm_ingest_key='integration-test',
            crm_outbox_file=Path(directory) / 'cola.sqlite3')
        repo = RelationalRepository(Path(directory) / 'crm.sqlite3', empty_state())
        crm = create_app(CRMSettings(_env_file=None, mode='demo', ingest_key=config.crm_ingest_key), repo)
        crm_deshabilitado = create_app(CRMSettings(_env_file=None, mode='demo'), repo)
        with patch('app.config.get_settings', return_value=config):
            from app.main import app as portal_app
        portal_app.dependency_overrides[usuario_actual] = lambda: Usuario('perfil-prueba', 'ana@example.com', 'Ana')
        db = AsyncMock()

        async def select(tabla, filtros, limit=1):
            return {
                'perfiles': [{'id':'perfil-prueba','ruc_empresa':'20123456789','nombre_completo':'Ana Prueba'}],
                'proveedores': [{'razon_social':'Empresa Integración Prueba'}],
                'desbloqueos': [{'convocatoria_id':12,'convocatorias':{'nomenclatura_norm':'LP-PRUEBA-001'}}],
            }[tabla]
        db.select.side_effect = select
        original_entregar = asesorias.entregar
        disponible = False
        recepcion_habilitada = False

        async def entregar(request_id):
            if disponible:
                transport = httpx.ASGITransport(app=crm if recepcion_habilitada else crm_deshabilitado)
            else:
                def apagado(request):
                    raise httpx.ConnectError('Servidor de prueba apagado', request=request)
                transport = httpx.MockTransport(apagado)
            return await original_entregar(request_id, transport=transport)

        update = SimpleNamespace(effective_chat=SimpleNamespace(id=123,type='private'),
            effective_user=SimpleNamespace(id=123,username='ana_prueba'),
            effective_message=SimpleNamespace(reply_text=AsyncMock(),text='',contact=None),
            callback_query=SimpleNamespace(answer=AsyncMock(),edit_message_text=AsyncMock(),data='',message=SimpleNamespace(message_id=50)))
        ctx = SimpleNamespace(args=[],user_data={})
        auth_http = AsyncMock()
        auth_http.get.return_value = httpx.Response(200,json={'email':'ana@example.com'})
        try:
            with patch('app.asesorias.get_settings', return_value=config), patch('app.asesorias.get_db', return_value=db), \
                    patch('app.asesorias.entregar', side_effect=entregar), \
                    patch('app.bot_asesorias.auth._http') as auth_factory, \
                    patch('app.bot_asesorias.auth.get_settings', return_value=config), \
                    patch('app.bot_asesorias.suscripciones.de_chat', new=AsyncMock(return_value={'perfil_id':'perfil-prueba'})):
                auth_factory.return_value.__aenter__.return_value = auth_http
                await bot_asesorias.cmd_asesor(update,ctx)
                nonce = ctx.user_data[bot_asesorias.PENDIENTE]['nonce']
                update.callback_query.data=f'asesoria:tipo_quote:{nonce}'
                await bot_asesorias.confirmar_asesoria(update,ctx)
                update.callback_query.data=f'asesoria:servicio_general:{nonce}'
                await bot_asesorias.confirmar_asesoria(update,ctx)
                update.effective_message.text='Necesito cotizar una certificación inicial para postular.'
                await bot_asesorias.texto_asesoria(update,ctx)
                update.effective_message.text='+51 999 888 777'
                await bot_asesorias.texto_asesoria(update,ctx)
                assert (await repo.load())['revision'] == 0
                update.callback_query.data=f'asesoria:confirmar:{nonce}'
                await bot_asesorias.confirmar_asesoria(update,ctx)
                assert 'pendiente' in update.callback_query.edit_message_text.await_args.args[0]
                cola = asesorias.ColaAsesorias(config.crm_outbox_file)
                solicitud_id = cola.resumen()[0]['id']
                assert cola.obtener(solicitud_id)['estado'] == 'pendiente'
                disponible=True
                assert await entregar(solicitud_id)=='pendiente'
                assert 'crm_ingest_disabled' in cola.obtener(solicitud_id)['ultimo_error']
                assert (await repo.load())['revision']==0
                recepcion_habilitada=True
                await entregar(solicitud_id)
                await bot_asesorias.confirmar_asesoria(update,ctx)
                snapshot=await repo.load()
                assert len(snapshot['data']['deals']) == len(snapshot['data']['prospects']) == 1
                assert snapshot['data']['deals'][0]['origin']=='Telegram'
                assert snapshot['data']['contacts'][0]['phone']=='+51 999 888 777'
                assert snapshot['data']['prospects'][0]['kind']=='quote'
                assert 'certificación inicial' in snapshot['data']['prospects'][0]['notes']
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=portal_app),base_url='http://testserver') as http:
                    response=await http.post('/api/asesorias',json={'solicitudId':'00000000-0000-0000-0000-000000000001','licitacionId':12})
                assert response.status_code==200, response.text
                assert response.json()['estado']=='entregada'
                snapshot=await repo.load()
                data=snapshot['data']
                assert len(data['deals'])==len(data['companies'])==len(data['contacts'])==len(data['tasks'])==1
                assert {p['origin'] for p in data['prospects']}=={'Lici','Telegram'}
                assert any(p['tender']=='LP-PRUEBA-001' for p in data['prospects'])
                print('Correcto: preguntas y confirmación Telegram, teléfono y necesidad en CRM, cola persistente, CRM apagado/deshabilitado, recuperación sin duplicados y petición web; un negocio con ambos orígenes y su tarea.')
        finally:
            portal_app.dependency_overrides.clear()


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--crm-path',type=Path,default=Path(__file__).resolve().parents[2] / 'crm')
    args=parser.parse_args()
    asyncio.run(probar(args.crm_path.resolve()))
