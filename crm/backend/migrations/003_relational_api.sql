-- Acceso exclusivo del backend. Los roles cliente no pueden ejecutar estas funciones.
-- Cada guardado confirma filas, recibo e historial en una transacción.
begin;
create or replace function licihub_crm.enlazar_proveedor()
returns trigger language plpgsql set search_path='' as $$ begin
  select p.ruc into new.ruc_proveedor from public.proveedores p where p.ruc=new.ruc;
  return new;
end $$;
drop trigger if exists enlazar_proveedor on licihub_crm.empresas;
create trigger enlazar_proveedor before insert or update of ruc on licihub_crm.empresas
for each row execute function licihub_crm.enlazar_proveedor();

create or replace function licihub_crm.validar_enlace_portal()
returns trigger language plpgsql set search_path='' as $$ declare ruc text; a record; begin
  select c.ruc into ruc from licihub_crm.empresas c where c.espacio_id=new.espacio_id and c.id=new.empresa_id;
  if tg_table_name='contactos' then
    if new.perfil_portal_id is not null and not exists
      (select 1 from public.perfiles p where p.id=new.perfil_portal_id and p.ruc_empresa=ruc) then
      raise exception using errcode='23514', message='El perfil del portal no pertenece a esta empresa';
    end if;
  else
    if new.analisis_id is not null then
      select x.ruc,x.convocatoria_id into a from public.analisis_empresa_licitacion x where x.id=new.analisis_id;
      if a.ruc is distinct from ruc or a.convocatoria_id is distinct from new.convocatoria_id then
        raise exception using errcode='23514', message='El análisis no corresponde a esta empresa y licitación';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists enlace_portal on licihub_crm.contactos;
create trigger enlace_portal before insert or update on licihub_crm.contactos for each row execute function licihub_crm.validar_enlace_portal();
drop trigger if exists enlace_portal on licihub_crm.prospectos;
create trigger enlace_portal before insert or update on licihub_crm.prospectos for each row execute function licihub_crm.validar_enlace_portal();

create or replace function licihub_crm.registro_inmutable()
returns trigger language plpgsql set search_path='' as $$ begin
  raise exception using errcode='23514', message='El historial es inmutable; crea una nueva versión';
end $$;
do $$ declare t text; begin
  foreach t in array array['cotizaciones','partidas_cotizacion','actividades','historial_etapas','recibos'] loop
    execute format('drop trigger if exists registro_inmutable on licihub_crm.%I',t);
    execute format('create trigger registro_inmutable before update or delete on licihub_crm.%I for each row execute function licihub_crm.registro_inmutable()',t);
  end loop;
end $$;

create or replace function public.licihub_crm_miembro(p_espacio_id uuid, p_usuario_id uuid)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('nombre_visible',m.nombre_visible,'rol',m.rol)
  from licihub_crm.miembros m where m.espacio_id=p_espacio_id and m.usuario_id=p_usuario_id and m.activo;
$$;

create or replace function public.licihub_crm_estado(p_espacio_id uuid, p_solicitud_id text default null)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('revision',w.revision,'tablas',jsonb_build_object(
    'empresas',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.empresas t where t.espacio_id=w.id),'[]'::jsonb),
    'contactos',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.contactos t where t.espacio_id=w.id),'[]'::jsonb),
    'productos',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.productos t where t.espacio_id=w.id),'[]'::jsonb),
    'negocios',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.negocios t where t.espacio_id=w.id),'[]'::jsonb),
    'prospectos',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.prospectos t where t.espacio_id=w.id),'[]'::jsonb),
    'tareas',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.tareas t where t.espacio_id=w.id),'[]'::jsonb),
    'actividades',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.actividades t where t.espacio_id=w.id),'[]'::jsonb),
    'cotizaciones',coalesce((select jsonb_agg(to_jsonb(t) order by orden) from licihub_crm.cotizaciones t where t.espacio_id=w.id),'[]'::jsonb),
    'partidas_cotizacion',coalesce((select jsonb_agg(to_jsonb(t) order by cotizacion_id,numero_partida) from licihub_crm.partidas_cotizacion t where t.espacio_id=w.id),'[]'::jsonb),
    'recibos',coalesce((select jsonb_agg(to_jsonb(t)) from licihub_crm.recibos t where t.espacio_id=w.id and t.solicitud_id=p_solicitud_id),'[]'::jsonb)
  )) from licihub_crm.espacios w where w.id=p_espacio_id;
$$;

create or replace function licihub_crm.escribir_fila(p_tabla text,p_fila jsonb,p_insertar boolean)
returns void language plpgsql set search_path='' as $$
declare columnas_sql text; valores_sql text; asignaciones_sql text; afectadas integer; begin
  if p_tabla<>all(array['empresas','contactos','productos','negocios','prospectos','tareas','actividades','cotizaciones','partidas_cotizacion']) then
    raise exception using errcode='22023',message='Tabla inválida';
  end if;
  if not p_insertar and p_tabla=any(array['cotizaciones','partidas_cotizacion','actividades']) then
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
    if t='actividades' then
      datos_fila=datos_fila || jsonb_build_object('actor_usuario_id',p_actor_usuario_id);
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
    group by q.id,q.subtotal having count(i.numero_partida)<>1 or sum(i.precio_unitario*i.cantidad)<>q.subtotal limit 1;
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
