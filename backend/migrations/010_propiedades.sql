-- Propiedades personalizadas (solo administración). Ejecutar después de 002/003; compatible con 005 a 009.
-- Agrega la tabla propiedades y la columna campos (valores) en empresas, contactos y negocios.
-- No borra ni cambia datos existentes. Crea la propiedad de ejemplo «Sector» para empresas. Puede ejecutarse nuevamente.
begin;
create table if not exists licihub_crm.propiedades (
  espacio_id uuid not null references licihub_crm.espacios(id),
  id uuid not null,
  entidad text not null check (entidad in ('deal','company','contact')),
  nombre text not null check (length(nombre) between 2 and 60),
  tipo text not null check (tipo in ('text','number','select','date')),
  opciones text not null default '[]',
  activo boolean not null default true,
  creado_en timestamptz not null,
  orden integer not null check (orden >= 0),
  primary key (espacio_id, id)
);
alter table licihub_crm.propiedades enable row level security;
revoke all on licihub_crm.propiedades from public,anon,authenticated;
grant select,insert,update on licihub_crm.propiedades to service_role;
alter table licihub_crm.empresas add column if not exists campos text not null default '{}';
alter table licihub_crm.contactos add column if not exists campos text not null default '{}';
alter table licihub_crm.negocios add column if not exists campos text not null default '{}';

insert into licihub_crm.propiedades(espacio_id,id,entidad,nombre,tipo,opciones,activo,creado_en,orden)
select e.id,gen_random_uuid(),'company','Sector','select',
  '["Construcción","Minería","Servicios","Comercio","Manufactura","Educación","Otros"]',true,now(),
  coalesce((select max(p.orden)+1 from licihub_crm.propiedades p where p.espacio_id=e.id),0)
from licihub_crm.espacios e
where not exists (select 1 from licihub_crm.propiedades p where p.espacio_id=e.id and p.entidad='company' and lower(p.nombre)='sector');

create or replace function public.licihub_crm_estado(p_espacio_id uuid, p_solicitud_id text default null)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('version_esquema',3,'revision',w.revision,'tablas',jsonb_build_object(
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
    'propiedades',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.propiedades t where t.espacio_id=w.id),'[]'::jsonb),
    'recibos',coalesce((select jsonb_agg(to_jsonb(t)) from licihub_crm.recibos t where t.espacio_id=w.id and t.solicitud_id=p_solicitud_id),'[]'::jsonb)
  )) from licihub_crm.espacios w where w.id=p_espacio_id;
$$;

create or replace function licihub_crm.escribir_fila(p_tabla text,p_fila jsonb,p_insertar boolean)
returns void language plpgsql set search_path='' as $$
declare columnas_sql text; valores_sql text; asignaciones_sql text; afectadas integer; begin
  if p_tabla<>all(array['empresas','contactos','productos','negocios','prospectos','tareas','actividades','cotizaciones','partidas_cotizacion','eventos_cotizacion','propiedades']) then
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
    if t='propiedades' and (p_integracion or rol_miembro<>'admin') then
      raise exception using errcode='42501',message='Las propiedades requieren administrador';
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
