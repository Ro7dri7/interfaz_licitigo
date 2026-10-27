-- Service-only gateway. UI/user roles have no direct access to commercial tables or these RPCs.
-- Each commit applies a row delta and its receipt in one PostgreSQL transaction.
begin;
create or replace function licihub_crm.link_provider()
returns trigger language plpgsql set search_path='' as $$ begin
  select p.ruc into new.provider_ruc from public.proveedores p where p.ruc=new.ruc;
  return new;
end $$;
drop trigger if exists link_provider on licihub_crm.companies;
create trigger link_provider before insert or update of ruc on licihub_crm.companies
for each row execute function licihub_crm.link_provider();

create or replace function licihub_crm.validate_portal_link()
returns trigger language plpgsql set search_path='' as $$ declare ruc text; a record; begin
  select c.ruc into ruc from licihub_crm.companies c where c.workspace_id=new.workspace_id and c.id=new.company_id;
  if tg_table_name='contacts' then
    if new.portal_profile_id is not null and not exists
      (select 1 from public.perfiles p where p.id=new.portal_profile_id and p.ruc_empresa=ruc) then
      raise exception using errcode='23514', message='Portal profile does not belong to this company';
    end if;
  else
    if new.analysis_id is not null then
      select x.ruc,x.convocatoria_id into a from public.analisis_empresa_licitacion x where x.id=new.analysis_id;
      if a.ruc is distinct from ruc or a.convocatoria_id is distinct from new.convocatoria_id then
        raise exception using errcode='23514', message='Analysis does not belong to this company and tender';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists portal_link on licihub_crm.contacts;
create trigger portal_link before insert or update on licihub_crm.contacts for each row execute function licihub_crm.validate_portal_link();
drop trigger if exists portal_link on licihub_crm.prospects;
create trigger portal_link before insert or update on licihub_crm.prospects for each row execute function licihub_crm.validate_portal_link();

create or replace function licihub_crm.immutable_record()
returns trigger language plpgsql set search_path='' as $$ begin
  raise exception using errcode='23514', message='Historical records are immutable; create a new version';
end $$;
do $$ declare t text; begin
  foreach t in array array['quotes','quote_items','activities','stage_history','receipts'] loop
    execute format('drop trigger if exists immutable_record on licihub_crm.%I',t);
    execute format('create trigger immutable_record before update or delete on licihub_crm.%I for each row execute function licihub_crm.immutable_record()',t);
  end loop;
end $$;

create or replace function public.licihub_crm_member(p_workspace_id uuid, p_user_id uuid)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('display_name',m.display_name,'role',m.role)
  from licihub_crm.members m where m.workspace_id=p_workspace_id and m.user_id=p_user_id and m.active;
$$;

create or replace function public.licihub_crm_state(p_workspace_id uuid, p_request_id text default null)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('revision',w.revision,'tables',jsonb_build_object(
    'companies',coalesce((select jsonb_agg(to_jsonb(t) order by sort_order) from licihub_crm.companies t where t.workspace_id=w.id),'[]'::jsonb),
    'contacts',coalesce((select jsonb_agg(to_jsonb(t) order by sort_order) from licihub_crm.contacts t where t.workspace_id=w.id),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(to_jsonb(t) order by sort_order) from licihub_crm.products t where t.workspace_id=w.id),'[]'::jsonb),
    'deals',coalesce((select jsonb_agg(to_jsonb(t) order by sort_order) from licihub_crm.deals t where t.workspace_id=w.id),'[]'::jsonb),
    'prospects',coalesce((select jsonb_agg(to_jsonb(t) order by sort_order) from licihub_crm.prospects t where t.workspace_id=w.id),'[]'::jsonb),
    'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by sort_order) from licihub_crm.tasks t where t.workspace_id=w.id),'[]'::jsonb),
    'activities',coalesce((select jsonb_agg(to_jsonb(t) order by sort_order) from licihub_crm.activities t where t.workspace_id=w.id),'[]'::jsonb),
    'quotes',coalesce((select jsonb_agg(to_jsonb(t) order by sort_order) from licihub_crm.quotes t where t.workspace_id=w.id),'[]'::jsonb),
    'quote_items',coalesce((select jsonb_agg(to_jsonb(t) order by quote_id,line_number) from licihub_crm.quote_items t where t.workspace_id=w.id),'[]'::jsonb),
    'receipts',coalesce((select jsonb_agg(to_jsonb(t)) from licihub_crm.receipts t where t.workspace_id=w.id and t.request_id=p_request_id),'[]'::jsonb)
  )) from licihub_crm.workspaces w where w.id=p_workspace_id;
$$;

create or replace function licihub_crm.write_row(p_table text,p_row jsonb,p_insert boolean)
returns void language plpgsql set search_path='' as $$
declare columns_sql text; values_sql text; updates_sql text; affected integer; begin
  if p_table<>all(array['companies','contacts','products','deals','prospects','tasks','activities','quotes','quote_items']) then
    raise exception using errcode='22023',message='Invalid table';
  end if;
  if not p_insert and p_table=any(array['quotes','quote_items','activities']) then
    raise exception using errcode='23514',message='Immutable record';
  end if;
  if exists(select 1 from jsonb_object_keys(p_row) k where not exists
    (select 1 from information_schema.columns c where c.table_schema='licihub_crm' and c.table_name=p_table and c.column_name=k)) then
    raise exception using errcode='22023',message='Invalid column';
  end if;
  select string_agg(format('%I',k),',' order by k),string_agg(format('r.%I',k),',' order by k),
    string_agg(format('%I=r.%I',k,k),',' order by k) filter(where k not in ('workspace_id','id'))
    into columns_sql,values_sql,updates_sql from jsonb_object_keys(p_row) k;
  if p_insert then
    execute format('insert into licihub_crm.%I (%s) select %s from jsonb_populate_record(null::licihub_crm.%I,$1) r',
                   p_table,columns_sql,values_sql,p_table) using p_row;
  else
    execute format('update licihub_crm.%I t set %s from jsonb_populate_record(null::licihub_crm.%I,$1) r where t.workspace_id=r.workspace_id and t.id=r.id',
                   p_table,updates_sql,p_table) using p_row;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception using errcode='40001',message='CRM revision conflict'; end if;
  end if;
end $$;

create or replace function public.licihub_crm_commit(
  p_workspace_id uuid,p_revision bigint,p_changes jsonb,p_request_id text,p_digest text,
  p_actor_user_id uuid default null,p_integration boolean default false
) returns jsonb language plpgsql set search_path='' as $$
declare revision bigint; receipt text; member_role text; actor_label text; change jsonb; row_data jsonb;
  t text; old_stage text; new_stage text; invalid_quote uuid;
begin
  if p_revision is null or p_revision<0 or p_request_id is null or length(p_request_id) not between 1 and 125
     or p_digest is null or p_digest !~ '^[a-f0-9]{64}$' or p_changes is null
     or jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes)>1000 then
    raise exception using errcode='22023',message='Invalid command';
  end if;
  if p_integration then
    if p_actor_user_id is not null then raise exception using errcode='42501',message='Invalid integration actor'; end if;
    actor_label='Integración LiciHub';
  else
    select m.role,m.display_name into member_role,actor_label from licihub_crm.members m
    where m.workspace_id=p_workspace_id and m.user_id=p_actor_user_id and m.active for share;
    if member_role is null then raise exception using errcode='42501',message='Active CRM membership required'; end if;
  end if;
  select w.revision into revision from licihub_crm.workspaces w where w.id=p_workspace_id for update;
  if not found then raise exception using errcode='P0002',message='Workspace not provisioned'; end if;
  select r.digest into receipt from licihub_crm.receipts r where r.workspace_id=p_workspace_id and r.request_id=p_request_id;
  if found then
    if receipt<>p_digest then raise exception using errcode='22023',message='Request identifier already used'; end if;
    return public.licihub_crm_state(p_workspace_id,p_request_id);
  end if;
  if revision<>p_revision then raise exception using errcode='40001',message='CRM revision conflict'; end if;
  for change in select * from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(change->'row') is distinct from 'object' or jsonb_typeof(change->'insert') is distinct from 'boolean' then
      raise exception using errcode='22023',message='Invalid row change';
    end if;
    t=change->>'table'; row_data=change->'row'; old_stage=null;
    if row_data->>'workspace_id' is distinct from p_workspace_id::text then
      raise exception using errcode='42501',message='Workspace boundary violation';
    end if;
    if t='products' and (p_integration or member_role<>'admin') then
      raise exception using errcode='42501',message='Catalog requires administrator';
    end if;
    if p_integration and t<>all(array['companies','contacts','deals','prospects','tasks','activities']) then
      raise exception using errcode='42501',message='Integration operation not allowed';
    end if;
    if t='activities' then
      row_data=row_data || jsonb_build_object('actor_user_id',p_actor_user_id);
    end if;
    if t='deals' then
      select d.stage into old_stage from licihub_crm.deals d where d.workspace_id=p_workspace_id and d.id=(row_data->>'id')::uuid;
    end if;
    perform licihub_crm.write_row(t,row_data,(change->>'insert')::boolean);
    if t='deals' then
      new_stage=row_data->>'stage';
      if old_stage is distinct from new_stage then
        insert into licihub_crm.stage_history(workspace_id,id,deal_id,from_stage,to_stage,reason,actor_user_id,actor_label,created_at)
        values(p_workspace_id,gen_random_uuid(),(row_data->>'id')::uuid,old_stage,new_stage,coalesce(row_data->>'loss_reason',''),p_actor_user_id,actor_label,(row_data->>'updated_at')::timestamptz);
      end if;
    end if;
  end loop;
  select q.id into invalid_quote from licihub_crm.quotes q left join licihub_crm.quote_items i
    on i.workspace_id=q.workspace_id and i.quote_id=q.id where q.workspace_id=p_workspace_id
    group by q.id,q.subtotal having count(i.line_number)<>1 or sum(i.unit_price*i.quantity)<>q.subtotal limit 1;
  if found then raise exception using errcode='23514',message='Quote items do not match header'; end if;
  insert into licihub_crm.receipts(workspace_id,request_id,digest,actor_user_id,sort_order)
    values(p_workspace_id,p_request_id,p_digest,p_actor_user_id,revision+1);
  update licihub_crm.workspaces w set revision=w.revision+1 where w.id=p_workspace_id;
  return public.licihub_crm_state(p_workspace_id,p_request_id);
end $$;

revoke all on all functions in schema licihub_crm from public,anon,authenticated;
grant execute on all functions in schema licihub_crm to service_role;
revoke all on function public.licihub_crm_member(uuid,uuid),public.licihub_crm_state(uuid,text),
  public.licihub_crm_commit(uuid,bigint,jsonb,text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.licihub_crm_member(uuid,uuid),public.licihub_crm_state(uuid,text),
  public.licihub_crm_commit(uuid,bigint,jsonb,text,text,uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
