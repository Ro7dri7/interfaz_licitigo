-- OPTIONAL PROVISIONING TEMPLATE, not an automatic migration.
-- Run 002 and 003 first. Replace the user UUID below with YOUR existing Supabase Auth user.
-- This file creates a NEW empty workspace and grants only that explicitly chosen user CRM admin.
-- Do not run again to recover its ID: query licihub_crm.workspaces instead.
-- To find your UUID: Supabase > Authentication > Users, then open your own account.
do $$
declare
  admin_user_id uuid := 'REEMPLAZAR_POR_UUID_USUARIO_AUTH';
  new_workspace_id uuid := gen_random_uuid();
begin
  if not exists (select 1 from auth.users where id=admin_user_id) then
    raise exception 'El usuario indicado no existe en Supabase Auth';
  end if;
  insert into licihub_crm.workspaces(id,name) values(new_workspace_id,'LiciHub Comercial');
  insert into licihub_crm.members(workspace_id,user_id,display_name,role)
    values(new_workspace_id,admin_user_id,'Administrador LiciHub','admin');
  raise notice 'CRM_WORKSPACE_ID=%',new_workspace_id;
end $$;

-- To inspect the created workspace without creating another:
-- select id,name,revision from licihub_crm.workspaces order by created_at desc;
