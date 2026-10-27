-- HISTORICAL JSONB PILOT. Superseded by 002_relational_tables.sql + 003_relational_api.sql.
-- Do not apply this file for a new relational installation. Existing pilot data is not deleted.
-- No existing Lici table or auth user is changed by this migration.
begin;
create table if not exists public.crm_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  revision bigint not null default 0 check (revision >= 0),
  data jsonb not null default '{"companies":[],"contacts":[],"prospects":[],"deals":[],"tasks":[],"activities":[],"products":[],"quotes":[],"receipts":[]}'::jsonb,
  check (jsonb_typeof(data) = 'object')
);
create table if not exists public.crm_members (
  workspace_id uuid not null references public.crm_workspaces(id),
  user_id uuid not null references auth.users(id),
  display_name text not null,
  role text not null check (role in ('admin', 'commercial')),
  active boolean not null default true,
  primary key (workspace_id, user_id)
);
alter table public.crm_workspaces enable row level security;
alter table public.crm_members enable row level security;
revoke all on public.crm_workspaces, public.crm_members from anon, authenticated;
grant select, insert, update on public.crm_workspaces, public.crm_members to service_role;
commit;
-- Provision the workspace and members separately with authorized user IDs.
-- No account receives commercial access automatically.
