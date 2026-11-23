-- Equipo comercial: listar y actualizar licihub_crm.miembros desde el panel de admin.
-- Idempotente. No borra filas. Ejecutar en el SQL Editor después de 010.
begin;

create or replace function public.licihub_crm_equipo(p_espacio_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'usuarioId', m.usuario_id, 'nombre', m.nombre_visible, 'correo', coalesce(u.email, ''),
    'rol', m.rol, 'activo', m.activo
  ) order by m.nombre_visible), '[]'::jsonb)
  from licihub_crm.miembros m
  left join auth.users u on u.id = m.usuario_id
  where m.espacio_id = p_espacio_id;
$$;

create or replace function public.licihub_crm_guardar_miembro(
  p_espacio_id uuid, p_usuario_id uuid, p_nombre text, p_rol text, p_activo boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_rol <> all(array['admin','commercial']) then
    raise exception using errcode='22023', message='Rol inválido';
  end if;
  if length(btrim(p_nombre)) < 2 then
    raise exception using errcode='22023', message='El nombre visible es demasiado corto';
  end if;
  insert into licihub_crm.miembros(espacio_id, usuario_id, nombre_visible, rol, activo)
    values (p_espacio_id, p_usuario_id, left(btrim(p_nombre), 100), p_rol, p_activo)
  on conflict (espacio_id, usuario_id) do update
    set nombre_visible = excluded.nombre_visible, rol = excluded.rol, activo = excluded.activo;
end $$;

revoke all on function public.licihub_crm_equipo(uuid),
  public.licihub_crm_guardar_miembro(uuid,uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public.licihub_crm_equipo(uuid),
  public.licihub_crm_guardar_miembro(uuid,uuid,text,text,boolean) to service_role;

notify pgrst, 'reload schema';
commit;
