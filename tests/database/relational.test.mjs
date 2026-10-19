import { PGlite } from '@electric-sql/pglite'
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const workspace='10000000-0000-0000-0000-000000000001'
const admin='20000000-0000-0000-0000-000000000001', advisor='20000000-0000-0000-0000-000000000002'
const sources=['backend/migrations/002_relational_tables.sql','backend/migrations/003_relational_api.sql'].map(p=>readFileSync(p,'utf8'))
const python=process.env.CRM_PYTHON || ['backend/.venv/Scripts/python.exe','../interfaz_licitigo/backend/.venv/Scripts/python.exe','backend/.venv/bin/python'].map(p=>resolve(p)).find(existsSync) || 'python'
const run=spawnSync(python,['tests/database/fixtures.py'],{encoding:'utf8',windowsHide:true})
assert.equal(run.status,0,run.stderr)
const fixture=JSON.parse(run.stdout)

async function database() {
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
  for(const sql of sources) await db.exec(sql)
  await db.query('insert into licihub_crm.workspaces(id,name) values($1,$2)',[workspace,'Prueba relacional'])
  await db.query("insert into licihub_crm.members values($1,$2,'SQL admin','admin',true),($1,$3,'SQL asesor','commercial',true)",[workspace,admin,advisor])
  await db.exec('set role service_role')
  return db
}
async function commit(db,event,{user=admin,integration=false,space=workspace}={}) {
  return (await db.query('select public.licihub_crm_commit($1::uuid,$2::bigint,$3::jsonb,$4,$5,$6::uuid,$7::boolean) as state',
    [space,event.revision,JSON.stringify(event.changes),event.receipt.id,event.receipt.digest,user,integration])).rows[0].state
}
async function withDatabase(fn) {const db=await database();try{await fn(db)}finally{await db.close()}}

test('PostgreSQL schema supports the complete existing domain flow with relational rows',()=>withDatabase(async db=>{
  for(const event of fixture.events) await commit(db,event)
  const state=(await db.query('select public.licihub_crm_state($1::uuid) as state',[workspace])).rows[0].state
  assert.equal(state.revision,6)
  assert.equal(state.tables.companies.length,1)
  assert.equal(state.tables.deals.length,1)
  assert.equal(state.tables.deals[0].stage,'won')
  assert.equal(state.tables.companies[0].provider_ruc,'20998877665')
  assert.equal(state.tables.prospects.filter(p=>p.deal_id===state.tables.deals[0].id).length,2)
  assert.equal(state.tables.quotes[0].total,31875)
  assert.equal(state.tables.quote_items[0].unit_price,10005)
  assert.equal(state.tables.tasks[0].done,true)
  assert.equal(state.tables.receipts.length,0,'State reads do not load all historical idempotency hashes')
  const history=(await db.query('select * from licihub_crm.stage_history order by created_at')).rows
  assert.equal(history.length,2)
  assert.equal(history[1].to_stage,'won')
  assert.equal(history[1].actor_user_id,admin)
  const columns=(await db.query("select column_name from information_schema.columns where table_schema='licihub_crm' and table_name='workspaces'")).rows
  assert.equal(columns.some(r=>r.column_name==='data'),false)
}))

test('anon and a portal authenticated account cannot read tables or invoke commercial RPCs',()=>withDatabase(async db=>{
  for(const role of ['anon','authenticated']){
    await db.exec(`reset role;set role ${role}`)
    await assert.rejects(db.query('select * from licihub_crm.deals'),e=>e.code==='42501')
    await assert.rejects(db.query('select public.licihub_crm_state($1::uuid)',[workspace]),e=>e.code==='42501')
    await assert.rejects(db.query('select public.licihub_crm_member($1::uuid,$2::uuid)',[workspace,admin]),e=>e.code==='42501')
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
  await db.query('update licihub_crm.members set active=false where workspace_id=$1 and user_id=$2',[workspace,advisor])
  await db.exec('set role service_role')
  await assert.rejects(commit(db,fixture.events[3],{user:advisor}),e=>e.code==='42501')
}))

test('replay is safe, reused IDs with different intent and stale revisions do not write',()=>withDatabase(async db=>{
  await commit(db,fixture.events[0])
  const replay=await commit(db,fixture.events[0])
  assert.equal(replay.revision,1)
  assert.equal(replay.tables.companies.length,1)
  await assert.rejects(commit(db,{...fixture.events[0],receipt:{...fixture.events[0].receipt,digest:'f'.repeat(64)}}),e=>e.code==='22023')
  await assert.rejects(commit(db,{...fixture.events[1],revision:0}),e=>e.code==='40001')
}))

test('workspace and company foreign keys reject cross-linked records and roll back prior rows',()=>withDatabase(async db=>{
  const event=structuredClone(fixture.events[0])
  event.changes.find(c=>c.table==='contacts').row.company_id='30000000-0000-0000-0000-000000000001'
  await assert.rejects(commit(db,event),e=>e.code==='23503')
  assert.equal((await db.query('select count(*)::int as n from licihub_crm.companies')).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int as n from licihub_crm.receipts')).rows[0].n,0)
  event.changes[0].row.workspace_id='30000000-0000-0000-0000-000000000001'
  await assert.rejects(commit(db,event),e=>e.code==='42501')
}))

test('quote consistency and immutable historical records are enforced by the database',()=>withDatabase(async db=>{
  for(const event of fixture.events.slice(0,3)) await commit(db,event)
  const quote=structuredClone(fixture.events[3])
  quote.changes=quote.changes.filter(c=>c.table!=='quote_items')
  await assert.rejects(commit(db,quote),e=>e.code==='23514')
  assert.equal((await db.query('select count(*)::int as n from licihub_crm.quotes')).rows[0].n,0)
  await commit(db,fixture.events[3])
  await assert.rejects(db.query('update licihub_crm.quote_items set unit_price=1'),e=>e.code==='23514')
}))

test('portal links require the same company RUC and tender',()=>withDatabase(async db=>{
  await commit(db,fixture.events[0])
  await db.exec('reset role')
  await db.query('insert into public.perfiles values($1,$2)',[advisor,'20123456789'])
  await db.exec("insert into public.convocatorias values(1),(2); insert into public.analisis_empresa_licitacion values(1,'20998877665',1)")
  await db.exec('set role service_role')
  await assert.rejects(db.query('update licihub_crm.contacts set portal_profile_id=$1',[advisor]),e=>e.code==='23514')
  await assert.rejects(db.query('update licihub_crm.prospects set analysis_id=1,convocatoria_id=2'),e=>e.code==='23514')
  await db.query('update licihub_crm.prospects set analysis_id=1,convocatoria_id=1')
  assert.equal((await db.query('select analysis_id from licihub_crm.prospects')).rows[0].analysis_id,1)
}))

test('integration has no user actor and cannot modify the commercial catalog',()=>withDatabase(async db=>{
  await assert.rejects(commit(db,fixture.events[0],{integration:true}),e=>e.code==='42501')
  await commit(db,fixture.events[0],{user:null,integration:true})
  await commit(db,fixture.events[1],{user:null,integration:true})
  await assert.rejects(commit(db,fixture.events[2],{user:null,integration:true}),e=>e.code==='42501')
  assert.equal((await db.query('select count(*)::int as n from licihub_crm.products')).rows[0].n,0)
}))

test('manual provisioning template creates an empty space for only the selected existing user',()=>withDatabase(async db=>{
  await db.exec('reset role')
  const template=readFileSync('backend/migrations/004_provision.example.sql','utf8')
  await db.exec(template.replaceAll('REEMPLAZAR_POR_UUID_USUARIO_AUTH',admin))
  const spaces=(await db.query('select id from licihub_crm.workspaces where id<>$1',[workspace])).rows
  assert.equal(spaces.length,1)
  const members=(await db.query('select user_id,role from licihub_crm.members where workspace_id=$1',[spaces[0].id])).rows
  assert.deepEqual(members,[{user_id:admin,role:'admin'}])
  assert.equal((await db.query('select count(*)::int as n from licihub_crm.companies where workspace_id=$1',[spaces[0].id])).rows[0].n,0)
}))

test('migrations can run again without changing portal or commercial data',()=>withDatabase(async db=>{
  await commit(db,fixture.events[0])
  await db.exec('reset role')
  for(const sql of sources) await db.exec(sql)
  assert.equal((await db.query('select count(*)::int as n from licihub_crm.companies')).rows[0].n,1)
  assert.equal((await db.query('select count(*)::int as n from public.proveedores')).rows[0].n,1)
}))
