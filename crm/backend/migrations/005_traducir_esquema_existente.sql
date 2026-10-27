-- TRANSICIÓN OPCIONAL: solo si ya ejecutaste la versión en inglés de 002/003.
-- Detén la API CRM antes. Ejecuta este archivo y después las versiones actuales de 002 y 003.
-- Renombra objetos sin copiar ni borrar registros; no toca tablas del portal.
-- Para volver a los nombres anteriores, cambia revertir a true y reinstala el 003 anterior.
-- La reversión requiere la API detenida y la versión anterior del backend.
begin;
do $$
declare
  revertir boolean := false;
  tablas jsonb := '{
  "workspaces": "espacios",
  "members": "miembros",
  "companies": "empresas",
  "contacts": "contactos",
  "products": "productos",
  "deals": "negocios",
  "prospects": "prospectos",
  "tasks": "tareas",
  "activities": "actividades",
  "quotes": "cotizaciones",
  "quote_items": "partidas_cotizacion",
  "receipts": "recibos",
  "stage_history": "historial_etapas"
}'::jsonb;
  columnas jsonb := '{
  "workspace_id": "espacio_id",
  "user_id": "usuario_id",
  "name": "nombre",
  "display_name": "nombre_visible",
  "role": "rol",
  "active": "activo",
  "created_at": "creado_en",
  "provider_ruc": "ruc_proveedor",
  "origin": "origen",
  "sort_order": "orden",
  "company_id": "empresa_id",
  "email": "correo",
  "phone": "telefono",
  "portal_profile_id": "perfil_portal_id",
  "price": "precio",
  "currency": "moneda",
  "contact_id": "contacto_id",
  "service": "servicio",
  "owner_label": "responsable_nombre",
  "owner_user_id": "responsable_usuario_id",
  "stage": "etapa",
  "amount": "importe",
  "updated_at": "actualizado_en",
  "closed_at": "cerrado_en",
  "loss_reason": "motivo_perdida",
  "deal_id": "negocio_id",
  "kind": "tipo",
  "evidence": "evidencia",
  "tender": "licitacion",
  "analysis_id": "analisis_id",
  "deadline": "fecha_limite",
  "notes": "notas",
  "title": "titulo",
  "due_at": "vence_en",
  "done": "completada",
  "completed_at": "completada_en",
  "body": "contenido",
  "actor_label": "actor_nombre",
  "actor_user_id": "actor_usuario_id",
  "number": "numero",
  "discount_percent": "descuento_porcentaje",
  "discount_amount": "descuento_importe",
  "tax_percent": "impuesto_porcentaje",
  "tax_amount": "impuesto_importe",
  "status": "estado",
  "valid_until": "vigente_hasta",
  "terms": "condiciones",
  "quote_id": "cotizacion_id",
  "line_number": "numero_partida",
  "product_id": "producto_id",
  "product_name": "producto_nombre",
  "unit_price": "precio_unitario",
  "quantity": "cantidad",
  "request_id": "solicitud_id",
  "digest": "huella",
  "from_stage": "etapa_anterior",
  "to_stage": "etapa_nueva",
  "reason": "motivo"
}'::jsonb;
  indices jsonb := '{
  "contacts_email_identity": "contactos_identidad_correo",
  "one_open_need": "negocios_necesidad_abierta_unica",
  "deals_by_owner_stage": "negocios_por_responsable_etapa",
  "tasks_due": "tareas_por_vencimiento",
  "prospects_context": "prospectos_por_contexto",
  "activities_by_deal": "actividades_por_negocio"
}'::jsonb;
  origen text; destino text; tabla_actual text; columna_origen text; columna_destino text;
  nombre_disparador text; firma text;
begin
  if revertir then
    select jsonb_object_agg(value,key) into tablas from jsonb_each_text(tablas);
    select jsonb_object_agg(value,key) into columnas from jsonb_each_text(columnas);
    select jsonb_object_agg(value,key) into indices from jsonb_each_text(indices);
  end if;
  -- Rechazar esquemas mezclados antes de cambiar cualquier objeto.
  for origen,destino in select key,value from jsonb_each_text(tablas) loop
    if to_regclass(format('licihub_crm.%I',origen)) is not null
       and to_regclass(format('licihub_crm.%I',destino)) is not null then
      raise exception 'Existen ambas tablas % y %; no se fusionarán automáticamente',origen,destino;
    end if;
  end loop;
  if to_regclass(case when revertir then 'licihub_crm.espacios' else 'licihub_crm.workspaces' end) is null then
    raise notice 'No hay esquema anterior que traducir; no se cambió ningún registro';
    return;
  end if;
  -- Retirar los puntos de acceso anteriores durante la transición con la API detenida.
  foreach firma in array case when revertir then array[
    'public.licihub_crm_estado(uuid,text)', 'public.licihub_crm_miembro(uuid,uuid)',
    'public.licihub_crm_guardar(uuid,bigint,jsonb,text,text,uuid,boolean)'
  ] else array[
    'public.licihub_crm_state(uuid,text)', 'public.licihub_crm_member(uuid,uuid)',
    'public.licihub_crm_commit(uuid,bigint,jsonb,text,text,uuid,boolean)'
  ] end loop
    execute 'drop function if exists ' || firma;
  end loop;
  for origen,destino in select key,value from jsonb_each_text(tablas) loop
    if to_regclass(format('licihub_crm.%I',origen)) is null then
      raise exception 'Falta la tabla %; se revierte toda la transición',origen;
    end if;
    execute format('alter table licihub_crm.%I rename to %I',origen,destino);
    tabla_actual=destino;
    foreach nombre_disparador in array array['link_provider','portal_link','immutable_record',
      'enlazar_proveedor','enlace_portal','registro_inmutable'] loop
      execute format('drop trigger if exists %I on licihub_crm.%I',nombre_disparador,tabla_actual);
    end loop;
    for columna_origen,columna_destino in select key,value from jsonb_each_text(columnas) loop
      if exists(select 1 from information_schema.columns where table_schema='licihub_crm'
        and table_name=tabla_actual and column_name=columna_origen) then
        execute format('alter table licihub_crm.%I rename column %I to %I',tabla_actual,columna_origen,columna_destino);
      end if;
    end loop;
  end loop;
  for origen,destino in select key,value from jsonb_each_text(indices) loop
    if to_regclass(format('licihub_crm.%I',origen)) is not null then
      execute format('alter index licihub_crm.%I rename to %I',origen,destino);
    end if;
  end loop;
  foreach firma in array case when revertir then array[
    'licihub_crm.enlazar_proveedor()', 'licihub_crm.validar_enlace_portal()',
    'licihub_crm.registro_inmutable()', 'licihub_crm.escribir_fila(text,jsonb,boolean)'
  ] else array[
    'licihub_crm.link_provider()', 'licihub_crm.validate_portal_link()',
    'licihub_crm.immutable_record()', 'licihub_crm.write_row(text,jsonb,boolean)'
  ] end loop
    execute 'drop function if exists ' || firma;
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
