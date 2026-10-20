-- LiciHub: evolución aditiva de cotizaciones. Ejecutar UNA VEZ después de 002/003 en español.
-- Conserva registros e historial. No crea cuentas ni cambia tablas del portal.
-- Repetible; requiere backend actualizado. No vuelve a cargar ejemplos.
begin;
alter table licihub_crm.cotizaciones add column if not exists titulo text;
alter table licihub_crm.cotizaciones add column if not exists emisor_nombre text;
alter table licihub_crm.cotizaciones add column if not exists emisor_ruc text;
alter table licihub_crm.cotizaciones add column if not exists emisor_direccion text;
alter table licihub_crm.cotizaciones add column if not exists cliente_nombre text;
alter table licihub_crm.cotizaciones add column if not exists cliente_ruc text;
alter table licihub_crm.cotizaciones add column if not exists contacto_nombre text;
alter table licihub_crm.cotizaciones add column if not exists contacto_correo text;
alter table licihub_crm.cotizaciones add column if not exists responsable_nombre text;
alter table licihub_crm.cotizaciones add column if not exists impuesto_incluido boolean;

do $$ declare restriccion text; begin
  for restriccion in select conname from pg_constraint
    where conrelid='licihub_crm.cotizaciones'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%total =%' loop
    execute format('alter table licihub_crm.cotizaciones drop constraint %I',restriccion);
  end loop;
end $$;
alter table licihub_crm.cotizaciones add constraint cotizaciones_total_coherente check
  (total = subtotal - descuento_importe + case when coalesce(impuesto_incluido,false) then 0 else impuesto_importe end);

create table if not exists licihub_crm.eventos_cotizacion (
  espacio_id uuid not null,
  id uuid not null,
  cotizacion_id uuid not null,
  estado text not null check(estado in ('sent','accepted','rejected')),
  destinatario text not null check(length(destinatario) between 2 and 254),
  canal text not null check(canal in ('email','whatsapp','other')),
  nota text not null check(length(trim(nota)) between 2 and 2000),
  actor_nombre text not null,
  actor_usuario_id uuid references auth.users(id),
  creado_en timestamptz not null,
  orden integer not null check(orden>=0),
  primary key(espacio_id,id),
  unique(espacio_id,cotizacion_id,orden),
  foreign key(espacio_id,cotizacion_id) references licihub_crm.cotizaciones(espacio_id,id)
);
alter table licihub_crm.eventos_cotizacion enable row level security;
revoke all on licihub_crm.eventos_cotizacion from public,anon,authenticated;
grant select,insert on licihub_crm.eventos_cotizacion to service_role;
drop trigger if exists registro_inmutable on licihub_crm.eventos_cotizacion;
create trigger registro_inmutable before update or delete on licihub_crm.eventos_cotizacion
for each row execute function licihub_crm.registro_inmutable();

create or replace function licihub_crm.validar_evento_cotizacion()
returns trigger language plpgsql set search_path='' as $$
declare propuesta record; anterior text; cantidad integer;
begin
  select q.* into propuesta from licihub_crm.cotizaciones q
    where q.espacio_id=new.espacio_id and q.id=new.cotizacion_id for share;
  if not found then raise exception using errcode='23503',message='Cotización inexistente en este espacio'; end if;
  select e.estado into anterior from licihub_crm.eventos_cotizacion e
    where e.espacio_id=new.espacio_id and e.cotizacion_id=new.cotizacion_id order by e.orden desc limit 1;
  select count(*) into cantidad from licihub_crm.eventos_cotizacion e
    where e.espacio_id=new.espacio_id and e.cotizacion_id=new.cotizacion_id;
  if new.orden<>cantidad or (new.estado='sent' and anterior is not null)
    or (new.estado in ('accepted','rejected') and anterior is distinct from 'sent') then
    raise exception using errcode='23514',message='Transición de cotización inválida';
  end if;
  if new.estado in ('sent','accepted') and propuesta.vigente_hasta < (current_timestamp at time zone 'America/Lima')::date then
    raise exception using errcode='23514',message='La cotización está vencida';
  end if;
  if new.estado='sent' and length(trim(propuesta.condiciones))=0 then
    raise exception using errcode='23514',message='La cotización no tiene condiciones comerciales';
  end if;
  if new.estado='accepted' and exists(select 1 from licihub_crm.eventos_cotizacion e
    join licihub_crm.cotizaciones q on q.espacio_id=e.espacio_id and q.id=e.cotizacion_id
    where q.espacio_id=new.espacio_id and q.negocio_id=propuesta.negocio_id
      and q.id<>new.cotizacion_id and e.estado='accepted') then
    raise exception using errcode='23514',message='Ya existe otra propuesta aceptada para este negocio';
  end if;
  return new;
end $$;
drop trigger if exists validar_evento on licihub_crm.eventos_cotizacion;
create trigger validar_evento before insert on licihub_crm.eventos_cotizacion
for each row execute function licihub_crm.validar_evento_cotizacion();

create or replace function public.licihub_crm_miembro(p_espacio_id uuid, p_usuario_id uuid)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('nombre_visible',m.nombre_visible,'rol',m.rol)
  from licihub_crm.miembros m where m.espacio_id=p_espacio_id and m.usuario_id=p_usuario_id and m.activo;
$$;

create or replace function public.licihub_crm_estado(p_espacio_id uuid, p_solicitud_id text default null)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('version_esquema',2,'revision',w.revision,'tablas',jsonb_build_object(
    'empresas',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.empresas t where t.espacio_id=w.id),'[]'::jsonb),
    'contactos',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.contactos t where t.espacio_id=w.id),'[]'::jsonb),
    'productos',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.productos t where t.espacio_id=w.id),'[]'::jsonb),
    'negocios',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.negocios t where t.espacio_id=w.id),'[]'::jsonb),
    'prospectos',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.prospectos t where t.espacio_id=w.id),'[]'::jsonb),
    'tareas',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.tareas t where t.espacio_id=w.id),'[]'::jsonb),
    'actividades',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.actividades t where t.espacio_id=w.id),'[]'::jsonb),
    'cotizaciones',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.cotizaciones t where t.espacio_id=w.id),'[]'::jsonb),
    'partidas_cotizacion',coalesce((select jsonb_agg(to_jsonb(t) order by cotizacion_id,numero_partida) from licihub_crm.partidas_cotizacion t where t.espacio_id=w.id),'[]'::jsonb),
    'eventos_cotizacion',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.eventos_cotizacion t where t.espacio_id=w.id),'[]'::jsonb),
    'recibos',coalesce((select jsonb_agg(to_jsonb(t)) from licihub_crm.recibos t where t.espacio_id=w.id and t.solicitud_id=p_solicitud_id),'[]'::jsonb)
  )) from licihub_crm.espacios w where w.id=p_espacio_id;
$$;

create or replace function licihub_crm.escribir_fila(p_tabla text,p_fila jsonb,p_insertar boolean)
returns void language plpgsql set search_path='' as $$
declare columnas_sql text; valores_sql text; asignaciones_sql text; afectadas integer; begin
  if p_tabla<>all(array['empresas','contactos','productos','negocios','prospectos','tareas','actividades','cotizaciones','partidas_cotizacion','eventos_cotizacion']) then
    raise exception using errcode='22023',message='Tabla inválida';
  end if;
  if not p_insertar and p_tabla=any(array['cotizaciones','partidas_cotizacion','eventos_cotizacion','actividades']) then
    raise exception using errcode='23514',message='Registro inmutable';
  end if;
  if exists(select 1 from jsonb_object_keys(p_fila) k where not exists
    (select 1 from information_schema.columns c where c.table_schema='licihub_crm' and c.table_name=p_tabla and c.column_name=k)) then
    raise exception using errcode='22023',message='Columna inválida';
  end if;
  select string_agg(format('%I',k),',' order by k),string_agg(format('r.%I',k),',' order by k),
    string_agg(format('%I=r.%I',k,k),',' order by k) filter(where k not in ('espacio_id','id'))
    into columnas_sql,valores_sql,asignaciones_sql from jsonb_object_keys(p_fila) k;
  if p_insertar then
    execute format('insert into licihub_crm.%I (%s) select %s from jsonb_populate_record(null::licihub_crm.%I,$1) r',
                   p_tabla,columnas_sql,valores_sql,p_tabla) using p_fila;
  else
    execute format('update licihub_crm.%I t set %s from jsonb_populate_record(null::licihub_crm.%I,$1) r where t.espacio_id=r.espacio_id and t.id=r.id',
                   p_tabla,asignaciones_sql,p_tabla) using p_fila;
    get diagnostics afectadas=row_count;
    if afectadas<>1 then raise exception using errcode='40001',message='Conflicto de revisión del CRM'; end if;
  end if;
end $$;

create or replace function public.licihub_crm_guardar(
  p_espacio_id uuid,p_revision bigint,p_cambios jsonb,p_solicitud_id text,p_huella text,
  p_actor_usuario_id uuid default null,p_integracion boolean default false
) returns jsonb language plpgsql set search_path='' as $$
declare revision bigint; recibo text; rol_miembro text; actor_nombre text; cambio jsonb; datos_fila jsonb;
  t text; etapa_previa text; etapa_actual text; cotizacion_invalida uuid;
begin
  if p_revision is null or p_revision<0 or p_solicitud_id is null or length(p_solicitud_id) not between 1 and 125
     or p_huella is null or p_huella !~ '^[a-f0-9]{64}$' or p_cambios is null
     or jsonb_typeof(p_cambios) is distinct from 'array' or jsonb_array_length(p_cambios)>1000 then
    raise exception using errcode='22023',message='Operación inválida';
  end if;
  if p_integracion then
    if p_actor_usuario_id is not null then raise exception using errcode='42501',message='Actor de integración inválido'; end if;
    actor_nombre='Integración LiciHub';
  else
    select m.rol,m.nombre_visible into rol_miembro,actor_nombre from licihub_crm.miembros m
    where m.espacio_id=p_espacio_id and m.usuario_id=p_actor_usuario_id and m.activo for share;
    if rol_miembro is null then raise exception using errcode='42501',message='Se requiere membresía comercial activa'; end if;
  end if;
  select w.revision into revision from licihub_crm.espacios w where w.id=p_espacio_id for update;
  if not found then raise exception using errcode='P0002',message='Espacio no configurado'; end if;
  select r.huella into recibo from licihub_crm.recibos r where r.espacio_id=p_espacio_id and r.solicitud_id=p_solicitud_id;
  if found then
    if recibo<>p_huella then raise exception using errcode='22023',message='Identificador de solicitud ya utilizado'; end if;
    return public.licihub_crm_estado(p_espacio_id,p_solicitud_id);
  end if;
  if revision<>p_revision then raise exception using errcode='40001',message='Conflicto de revisión del CRM'; end if;
  for cambio in select * from jsonb_array_elements(p_cambios) loop
    if jsonb_typeof(cambio->'fila') is distinct from 'object' or jsonb_typeof(cambio->'insertar') is distinct from 'boolean' then
      raise exception using errcode='22023',message='Cambio de fila inválido';
    end if;
    t=cambio->>'tabla'; datos_fila=cambio->'fila'; etapa_previa=null;
    if datos_fila->>'espacio_id' is distinct from p_espacio_id::text then
      raise exception using errcode='42501',message='La fila pertenece a otro espacio';
    end if;
    if t='productos' and (p_integracion or rol_miembro<>'admin') then
      raise exception using errcode='42501',message='El catálogo requiere administrador';
    end if;
    if p_integracion and t<>all(array['empresas','contactos','negocios','prospectos','tareas','actividades']) then
      raise exception using errcode='42501',message='Operación de integración no permitida';
    end if;
    if t in ('actividades','eventos_cotizacion') then
      datos_fila=datos_fila || jsonb_build_object('actor_usuario_id',p_actor_usuario_id,'actor_nombre',actor_nombre);
    end if;
    if t='negocios' then
      select d.etapa into etapa_previa from licihub_crm.negocios d where d.espacio_id=p_espacio_id and d.id=(datos_fila->>'id')::uuid;
    end if;
    perform licihub_crm.escribir_fila(t,datos_fila,(cambio->>'insertar')::boolean);
    if t='negocios' then
      etapa_actual=datos_fila->>'etapa';
      if etapa_previa is distinct from etapa_actual then
        insert into licihub_crm.historial_etapas(espacio_id,id,negocio_id,etapa_anterior,etapa_nueva,motivo,actor_usuario_id,actor_nombre,creado_en)
        values(p_espacio_id,gen_random_uuid(),(datos_fila->>'id')::uuid,etapa_previa,etapa_actual,coalesce(datos_fila->>'motivo_perdida',''),p_actor_usuario_id,actor_nombre,(datos_fila->>'actualizado_en')::timestamptz);
      end if;
    end if;
  end loop;
  select q.id into cotizacion_invalida from licihub_crm.cotizaciones q left join licihub_crm.partidas_cotizacion i
    on i.espacio_id=q.espacio_id and i.cotizacion_id=q.id where q.espacio_id=p_espacio_id
    group by q.id,q.subtotal having count(i.numero_partida) not between 1 and 50 or sum(i.precio_unitario*i.cantidad)<>q.subtotal limit 1;
  if found then raise exception using errcode='23514',message='Las partidas no coinciden con la cotización'; end if;
  insert into licihub_crm.recibos(espacio_id,solicitud_id,huella,actor_usuario_id,orden)
    values(p_espacio_id,p_solicitud_id,p_huella,p_actor_usuario_id,revision+1);
  update licihub_crm.espacios w set revision=w.revision+1 where w.id=p_espacio_id;
  return public.licihub_crm_estado(p_espacio_id,p_solicitud_id);
end $$;

revoke all on all functions in schema licihub_crm from public,anon,authenticated;
grant execute on all functions in schema licihub_crm to service_role;
revoke all on function public.licihub_crm_miembro(uuid,uuid),public.licihub_crm_estado(uuid,text),
  public.licihub_crm_guardar(uuid,bigint,jsonb,text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.licihub_crm_miembro(uuid,uuid),public.licihub_crm_estado(uuid,text),
  public.licihub_crm_guardar(uuid,bigint,jsonb,text,text,uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
