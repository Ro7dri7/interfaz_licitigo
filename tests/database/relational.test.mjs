import { PGlite } from '@electric-sql/pglite'
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const workspace='10000000-0000-0000-0000-000000000001'
const admin='20000000-0000-0000-0000-000000000001', advisor='20000000-0000-0000-0000-000000000002'
const sources=['backend/migrations/002_relational_tables.sql','backend/migrations/003_relational_api.sql'].map(p=>readFileSync(p,'utf8'))
const legacySources=['002_original_ingles.sql','003_original_ingles.sql'].map(p=>readFileSync('tests/database/fixtures/'+p,'utf8'))
const transition=readFileSync('backend/migrations/005_traducir_esquema_existente.sql','utf8')
const quoteMigration=readFileSync('backend/migrations/006_cotizaciones_multiples.sql','utf8')
const telegramMigration=readFileSync('backend/migrations/008_origen_telegram.sql','utf8')
const catalogMigration=readFileSync('backend/migrations/007_catalogo_iso.sql','utf8').replace(/espacio_destino uuid := '[^']+'/,
  `espacio_destino uuid := '${workspace}'`)
const python=process.env.CRM_PYTHON || ['backend/.venv/Scripts/python.exe','../interfaz_licitigo/backend/.venv/Scripts/python.exe','backend/.venv/bin/python'].map(p=>resolve(p)).find(existsSync) || 'python'
const run=spawnSync(python,['tests/database/fixtures.py'],{encoding:'utf8',windowsHide:true})
assert.equal(run.status,0,run.stderr)
const fixture=JSON.parse(run.stdout)

async function database({legacy=false}={}) {
  const db=new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.proveedores(ruc varchar(11) primary key);
    create table public.perfiles(id uuid primary key,ruc_empresa text);
    create table public.convocatorias(id bigint primary key);
    create table public.analisis_empresa_licitacion(id bigint primary key,ruc text,convocatoria_id bigint);
    grant select on all tables in schema public to service_role;
    insert into auth.users values ('${admin}'),('${advisor}');
    insert into public.proveedores values ('20998877665');`)
  for(const sql of legacy ? legacySources : sources) await db.exec(sql)
  if(!legacy) await db.exec(quoteMigration)
  await db.query(legacy ? 'insert into licihub_crm.workspaces(id,name) values($1,$2)' : 'insert into licihub_crm.espacios(id,nombre) values($1,$2)',[workspace,'Prueba relacional'])
  await db.query(`insert into licihub_crm.${legacy?'members':'miembros'} values($1,$2,'SQL admin','admin',true),($1,$3,'SQL asesor','commercial',true)`,[workspace,admin,advisor])
  await db.exec('set role service_role')
  return db
}
async function commit(db,event,{user=admin,integration=false,space=workspace}={}) {
  return (await db.query('select public.licihub_crm_guardar($1::uuid,$2::bigint,$3::jsonb,$4,$5,$6::uuid,$7::boolean) as state',
    [space,event.revision,JSON.stringify(event.changes),event.receipt.id,event.receipt.digest,user,integration])).rows[0].state
}
async function withDatabase(fn) {const db=await database();try{await fn(db)}finally{await db.close()}}

test('Telegram migration upgrades Spanish and translated legacy databases without weakening access', async () => {
  for (const legacy of [false, true]) {
    const db = await database({legacy})
    try {
      await db.exec('reset role')
      if (legacy) { await db.exec(transition); for (const source of sources) await db.exec(source); await db.exec(quoteMigration) }
      await db.exec(telegramMigration)
      await db.exec(telegramMigration)
      await db.exec('set role service_role')
      for (const original of fixture.events.slice(0, 2)) {
        const event = structuredClone(original)
        for (const change of event.changes) {
          if ('origen' in change.fila) change.fila.origen = 'Telegram'
        }
        await commit(db, event, {user:null, integration:true})
      }
      const state = (await db.query('select public.licihub_crm_estado($1::uuid) as state', [workspace])).rows[0].state
      assert.equal(state.tablas.empresas[0].origen, 'Telegram')
      assert.equal(state.tablas.negocios[0].origen, 'Telegram')
      await assert.rejects(db.query('update licihub_crm.empresas set origen=$1', ['Inexistente']), e=>e.code==='23514')
      await db.exec('reset role; set role authenticated')
      await assert.rejects(db.query('select * from licihub_crm.negocios'), e=>e.code==='42501')
    } finally { await db.close() }
  }
})

test('PostgreSQL schema supports the complete existing domain flow with relational rows',()=>withDatabase(async db=>{
  for(const event of fixture.events) await commit(db,event)
  const state=(await db.query('select public.licihub_crm_estado($1::uuid) as state',[workspace])).rows[0].state
  assert.equal(state.revision,6)
  assert.equal(state.tablas.empresas.length,1)
  assert.equal(state.tablas.negocios.length,1)
  assert.equal(state.tablas.negocios[0].etapa,'won')
  assert.equal(state.tablas.empresas[0].ruc_proveedor,'20998877665')
  assert.equal(state.tablas.prospectos.filter(p=>p.negocio_id===state.tablas.negocios[0].id).length,2)
  assert.equal(state.tablas.cotizaciones[0].total,31875)
  assert.equal(state.tablas.partidas_cotizacion[0].precio_unitario,10005)
  assert.equal(state.tablas.tareas[0].completada,true)
  assert.equal(state.tablas.recibos.length,0,'State reads do not load all historical idempotency hashes')
  const history=(await db.query('select * from licihub_crm.historial_etapas order by creado_en')).rows
  assert.equal(history.length,2)
  assert.equal(history[1].etapa_nueva,'won')
  assert.equal(history[1].actor_usuario_id,admin)
  const columns=(await db.query("select column_name from information_schema.columns where table_schema='licihub_crm' and table_name='espacios'")).rows
  assert.equal(columns.some(r=>r.column_name==='data'),false)
}))

test('anon and a portal authenticated account cannot read tables or invoke commercial RPCs',()=>withDatabase(async db=>{
  for(const role of ['anon','authenticated']){
    await db.exec(`reset role;set role ${role}`)
    await assert.rejects(db.query('select * from licihub_crm.negocios'),e=>e.code==='42501')
    await assert.rejects(db.query('select public.licihub_crm_estado($1::uuid)',[workspace]),e=>e.code==='42501')
    await assert.rejects(db.query('select public.licihub_crm_miembro($1::uuid,$2::uuid)',[workspace,admin]),e=>e.code==='42501')
    await assert.rejects(commit(db,fixture.events[0]),e=>e.code==='42501')
  }
}))

test('SQL verifies active membership and catalog permission independently of API',()=>withDatabase(async db=>{
  await assert.rejects(commit(db,fixture.events[0],{user:null}),e=>e.code==='42501')
  await commit(db,fixture.events[0],{user:advisor})
  await commit(db,fixture.events[1],{user:advisor})
  await assert.rejects(commit(db,fixture.events[2],{user:advisor}),e=>e.code==='42501')
  await commit(db,fixture.events[2])
  await db.exec('reset role')
  await db.query('update licihub_crm.miembros set activo=false where espacio_id=$1 and usuario_id=$2',[workspace,advisor])
  await db.exec('set role service_role')
  await assert.rejects(commit(db,fixture.events[3],{user:advisor}),e=>e.code==='42501')
}))

test('replay is safe, reused IDs with different intent and stale revisions do not write',()=>withDatabase(async db=>{
  await commit(db,fixture.events[0])
  const replay=await commit(db,fixture.events[0])
  assert.equal(replay.revision,1)
  assert.equal(replay.tablas.empresas.length,1)
  await assert.rejects(commit(db,{...fixture.events[0],receipt:{...fixture.events[0].receipt,digest:'f'.repeat(64)}}),e=>e.code==='22023')
  await assert.rejects(commit(db,{...fixture.events[1],revision:0}),e=>e.code==='40001')
}))

test('workspace and company foreign keys reject cross-linked records and roll back prior rows',()=>withDatabase(async db=>{
  const event=structuredClone(fixture.events[0])
  event.changes.find(c=>c.tabla==='contactos').fila.empresa_id='30000000-0000-0000-0000-000000000001'
  await assert.rejects(commit(db,event),e=>e.code==='23503')
  assert.equal((await db.query('select count(*)::int as n from licihub_crm.empresas')).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int as n from licihub_crm.recibos')).rows[0].n,0)
  event.changes[0].fila.espacio_id='30000000-0000-0000-0000-000000000001'
  await assert.rejects(commit(db,event),e=>e.code==='42501')
}))

test('quote consistency and immutable historical records are enforced by the database',()=>withDatabase(async db=>{
  for(const event of fixture.events.slice(0,3)) await commit(db,event)
  const quote=structuredClone(fixture.events[3])
  quote.changes=quote.changes.filter(c=>c.tabla!=='partidas_cotizacion')
  await assert.rejects(commit(db,quote),e=>e.code==='23514')
  assert.equal((await db.query('select count(*)::int as n from licihub_crm.cotizaciones')).rows[0].n,0)
  await commit(db,fixture.events[3])
  await assert.rejects(db.query('update licihub_crm.partidas_cotizacion set precio_unitario=1'),e=>e.code==='23514')
}))

test('portal links require the same company RUC and tender',()=>withDatabase(async db=>{
  await commit(db,fixture.events[0])
  await db.exec('reset role')
  await db.query('insert into public.perfiles values($1,$2)',[advisor,'20123456789'])
  await db.exec("insert into public.convocatorias values(1),(2); insert into public.analisis_empresa_licitacion values(1,'20998877665',1)")
  await db.exec('set role service_role')
  await assert.rejects(db.query('update licihub_crm.contactos set perfil_portal_id=$1',[advisor]),e=>e.code==='23514')
  await assert.rejects(db.query('update licihub_crm.prospectos set analisis_id=1,convocatoria_id=2'),e=>e.code==='23514')
  await db.query('update licihub_crm.prospectos set analisis_id=1,convocatoria_id=1')
  assert.equal((await db.query('select analisis_id from licihub_crm.prospectos')).rows[0].analisis_id,1)
}))

test('integration has no user actor and cannot modify the commercial catalog',()=>withDatabase(async db=>{
  await assert.rejects(commit(db,fixture.events[0],{integration:true}),e=>e.code==='42501')
  await commit(db,fixture.events[0],{user:null,integration:true})
  await commit(db,fixture.events[1],{user:null,integration:true})
  await assert.rejects(commit(db,fixture.events[2],{user:null,integration:true}),e=>e.code==='42501')
  assert.equal((await db.query('select count(*)::int as n from licihub_crm.productos')).rows[0].n,0)
}))

test('manual provisioning template creates an empty space for only the selected existing user',()=>withDatabase(async db=>{
  await db.exec('reset role')
  const template=readFileSync('backend/migrations/004_provision.example.sql','utf8')
  await db.exec(template.replaceAll('REEMPLAZAR_POR_UUID_USUARIO_AUTH',admin))
  const spaces=(await db.query('select id from licihub_crm.espacios where id<>$1',[workspace])).rows
  assert.equal(spaces.length,1)
  const miembros=(await db.query('select usuario_id,rol from licihub_crm.miembros where espacio_id=$1',[spaces[0].id])).rows
  assert.deepEqual(miembros,[{usuario_id:admin,rol:'admin'}])
  assert.equal((await db.query('select count(*)::int as n from licihub_crm.empresas where espacio_id=$1',[spaces[0].id])).rows[0].n,0)
}))

test('migrations can run again without changing portal or commercial data',()=>withDatabase(async db=>{
  await commit(db,fixture.events[0])
  await db.exec('reset role')
  for(const sql of sources) await db.exec(sql)
  await db.exec(quoteMigration)
  await db.exec(transition) // Already Spanish: no-op.
  assert.equal((await db.query('select count(*)::int as n from licihub_crm.empresas')).rows[0].n,1)
  assert.equal((await db.query('select count(*)::int as n from public.proveedores')).rows[0].n,1)
}))

test('multiple gross-price items preserve included IGV, document snapshots and immutable state events',()=>withDatabase(async db=>{
  for(const event of fixture.multipleEvents) await commit(db,event)
  const state=(await db.query('select public.licihub_crm_estado($1::uuid) as state',[workspace])).rows[0].state
  assert.equal(state.version_esquema,2)
  assert.equal(state.tablas.partidas_cotizacion.length,2)
  const quote=state.tablas.cotizaciones[0]
  assert.equal(quote.total,45022)
  assert.equal(quote.impuesto_importe,6868)
  assert.equal(quote.impuesto_incluido,true)
  assert.equal(quote.emisor_ruc,'20612137880')
  assert.deepEqual(state.tablas.eventos_cotizacion.map(e=>e.estado),['sent','accepted'])
  assert.equal(state.tablas.eventos_cotizacion[1].actor_usuario_id,admin)
  await assert.rejects(db.query("update licihub_crm.eventos_cotizacion set nota='Cambio'"),e=>e.code==='42501'||e.code==='23514')
}))

test('SQL refuses acceptance before sending and rolls back the whole command',()=>withDatabase(async db=>{
  for(const event of fixture.multipleEvents.slice(0,5)) await commit(db,event)
  await assert.rejects(commit(db,{...fixture.multipleEvents[6],revision:5}),e=>e.code==='23514')
  assert.equal((await db.query('select revision from licihub_crm.espacios')).rows[0].revision,5)
  assert.equal((await db.query('select count(*)::int as n from licihub_crm.eventos_cotizacion')).rows[0].n,0)
}))

test('ISO catalog migration loads only authorized rows and preserves edited prices when repeated',()=>withDatabase(async db=>{
  await db.exec('reset role')
  await db.exec(catalogMigration)
  assert.equal((await db.query('select count(*)::int as n from licihub_crm.productos')).rows[0].n,540)
  const source=(await db.query("select id,precio from licihub_crm.productos where nombre='ISO 9001:2015 - Certificacion Inicial Micro Empresa (Virtual)'")).rows[0]
  assert.equal(source.precio,444000)
  await db.query('update licihub_crm.productos set precio=12345 where id=$1',[source.id])
  await db.exec(catalogMigration)
  assert.equal((await db.query('select count(*)::int as n from licihub_crm.productos')).rows[0].n,540)
  assert.equal((await db.query('select precio from licihub_crm.productos where id=$1',[source.id])).rows[0].precio,12345)
  assert.equal((await db.query('select revision from licihub_crm.espacios')).rows[0].revision,1)
}))

test('English installation migrates to Spanish and can roll back without losing its full state',async()=>{
  const db=await database({legacy:true})
  try {
    for(const event of fixture.events) await db.query(
      'select public.licihub_crm_commit($1::uuid,$2::bigint,$3::jsonb,$4,$5,$6::uuid)',
      [workspace,event.revision,JSON.stringify(event.legacyChanges),event.receipt.id,event.receipt.digest,admin])
    const original=(await db.query('select public.licihub_crm_state($1::uuid) as state',[workspace])).rows[0].state
    await db.exec('reset role')
    await assert.rejects(db.exec(sources[0]),/005_traducir_esquema_existente/)
    await db.exec('rollback')
    await db.exec(transition)
    for(const sql of sources) await db.exec(sql)
    await db.exec('set role service_role')
    const translated=(await db.query('select public.licihub_crm_estado($1::uuid) as state',[workspace])).rows[0].state
    assert.equal(translated.revision,original.revision)
    assert.equal(translated.tablas.empresas[0].id,original.tables.companies[0].id)
    assert.equal(translated.tablas.partidas_cotizacion[0].precio_unitario,10005)
    assert.equal((await db.query('select count(*)::int as n from licihub_crm.recibos')).rows[0].n,6)
    await assert.rejects(db.query('select public.licihub_crm_state($1::uuid)',[workspace]),e=>e.code==='42883')
    await assert.rejects(db.query('update licihub_crm.partidas_cotizacion set precio_unitario=1'),e=>e.code==='23514')
    await db.exec('reset role')
    await db.exec(transition.replace('revertir boolean := false','revertir boolean := true'))
    await db.exec(legacySources[1])
    await db.exec('set role service_role')
    const restored=(await db.query('select public.licihub_crm_state($1::uuid) as state',[workspace])).rows[0].state
    assert.deepEqual(restored,original)
    assert.equal((await db.query('select count(*)::int as n from licihub_crm.stage_history')).rows[0].n,2)
  } finally {await db.close()}
})

test('transition refuses a mixed schema and preserves the existing records',async()=>{
  const db=await database({legacy:true})
  try {
    await db.exec('reset role;create table licihub_crm.empresas(id uuid primary key)')
    await assert.rejects(db.exec(transition),/Existen ambas tablas/)
    await db.exec('rollback')
    assert.equal((await db.query('select count(*)::int as n from licihub_crm.workspaces')).rows[0].n,1)
  } finally {await db.close()}
})
