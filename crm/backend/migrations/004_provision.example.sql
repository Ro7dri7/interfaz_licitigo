-- PLANTILLA OPCIONAL: ejecutar 002 y 003 antes.
-- Reemplaza el UUID por el de tu cuenta existente en Supabase Auth.
-- Crea UN espacio vacío y habilita únicamente a esa cuenta como administrador.
-- No repetir para recuperar el ID: usar la consulta del final.
-- UUID: Supabase > Authentication > Users > tu cuenta.
do $$
declare
  administrador_usuario_id uuid := 'REEMPLAZAR_POR_UUID_USUARIO_AUTH';
  nuevo_espacio_id uuid := gen_random_uuid();
begin
  if not exists (select 1 from auth.users where id=administrador_usuario_id) then
    raise exception 'El usuario indicado no existe en Supabase Auth';
  end if;
  insert into licihub_crm.espacios(id,nombre) values(nuevo_espacio_id,'LiciHub Comercial');
  insert into licihub_crm.miembros(espacio_id,usuario_id,nombre_visible,rol)
    values(nuevo_espacio_id,administrador_usuario_id,'Administrador LiciHub','admin');
  raise notice 'CRM_WORKSPACE_ID=%',nuevo_espacio_id;
end $$;

-- Consultar el espacio creado sin crear otro:
select id,nombre,revision from licihub_crm.espacios order by creado_en desc;
