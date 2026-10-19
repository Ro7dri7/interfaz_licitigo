-- LiciHub: standalone relational schema. Apply instead of the old JSONB pilot 001.
-- Additive: never modifies public.proveedores/perfiles/convocatorias or legacy CRM data.
begin;
create schema if not exists licihub_crm;
revoke all on schema licihub_crm from public, anon, authenticated;

-- BEGIN TABLES (also used to generate the isolated SQLite demo schema).
create table if not exists licihub_crm.workspaces (
  id uuid primary key,
  name text not null check (length(name) between 2 and 160),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default CURRENT_TIMESTAMP
);
create table if not exists licihub_crm.members (
  workspace_id uuid not null references licihub_crm.workspaces(id),
  user_id uuid not null references auth.users(id),
  display_name text not null check (length(display_name) between 2 and 100),
  role text not null check (role in ('admin','commercial')),
  active boolean not null default true,
  primary key (workspace_id, user_id)
);
create table if not exists licihub_crm.companies (
  workspace_id uuid not null references licihub_crm.workspaces(id),
  id uuid not null,
  name text not null check (length(name) between 2 and 160),
  ruc text check (ruc ~ '^[0-9]{11}$'),
  provider_ruc varchar(11) references public.proveedores(ruc),
  origin text not null check (origin in ('Lici','WhatsApp','Referido','Campaña','Manual','Partner')),
  created_at timestamptz not null,
  sort_order integer not null check (sort_order >= 0),
  primary key (workspace_id, id),
  unique (workspace_id, ruc),
  check (provider_ruc is null or provider_ruc = ruc)
);
create table if not exists licihub_crm.contacts (
  workspace_id uuid not null,
  id uuid not null,
  company_id uuid not null,
  name text not null check (length(name) between 1 and 100),
  email text not null default '',
  phone text not null default '',
  portal_profile_id uuid references public.perfiles(id),
  sort_order integer not null check (sort_order >= 0),
  primary key (workspace_id, id),
  unique (workspace_id, id, company_id),
  foreign key (workspace_id, company_id) references licihub_crm.companies(workspace_id, id)
);
create unique index if not exists contacts_email_identity on licihub_crm.contacts (workspace_id, company_id, lower(email)) where email <> '';
create table if not exists licihub_crm.products (
  workspace_id uuid not null references licihub_crm.workspaces(id),
  id uuid not null,
  name text not null check (length(name) between 2 and 160),
  price bigint not null check (price between 0 and 1000000000),
  currency text not null check (currency = 'PEN'),
  active boolean not null default true,
  sort_order integer not null check (sort_order >= 0),
  primary key (workspace_id, id)
);
create table if not exists licihub_crm.deals (
  workspace_id uuid not null,
  id uuid not null,
  company_id uuid not null,
  contact_id uuid,
  service text not null check (length(service) between 2 and 160),
  origin text not null check (origin in ('Lici','WhatsApp','Referido','Campaña','Manual','Partner')),
  owner_label text not null,
  owner_user_id uuid,
  stage text not null check (stage in ('new','contacted','qualified','quoted','followup','won','lost')),
  amount bigint not null check (amount >= 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  closed_at timestamptz,
  loss_reason text not null default '',
  sort_order integer not null check (sort_order >= 0),
  primary key (workspace_id, id),
  unique (workspace_id, id, company_id),
  foreign key (workspace_id, company_id) references licihub_crm.companies(workspace_id, id),
  foreign key (workspace_id, contact_id, company_id) references licihub_crm.contacts(workspace_id, id, company_id),
  foreign key (workspace_id, owner_user_id) references licihub_crm.members(workspace_id, user_id),
  check (stage <> 'lost' or length(trim(loss_reason)) > 0),
  check (stage <> 'won' or amount > 0),
  check ((stage in ('won','lost')) = (closed_at is not null))
);
create unique index if not exists one_open_need on licihub_crm.deals (workspace_id, company_id, lower(service)) where stage not in ('won','lost');
create table if not exists licihub_crm.prospects (
  workspace_id uuid not null,
  id uuid not null,
  company_id uuid not null,
  contact_id uuid,
  deal_id uuid,
  kind text not null check (kind in ('signal','advice','quote','manual')),
  origin text not null check (origin in ('Lici','WhatsApp','Referido','Campaña','Manual','Partner')),
  service text not null check (length(service) between 2 and 160),
  owner_label text not null,
  evidence text not null check (evidence in ('required','recommended','pending','none')),
  tender text not null default '',
  convocatoria_id bigint references public.convocatorias(id),
  analysis_id bigint references public.analisis_empresa_licitacion(id),
  deadline date,
  notes text not null default '',
  created_at timestamptz not null,
  sort_order integer not null check (sort_order >= 0),
  primary key (workspace_id, id),
  foreign key (workspace_id, company_id) references licihub_crm.companies(workspace_id, id),
  foreign key (workspace_id, contact_id, company_id) references licihub_crm.contacts(workspace_id, id, company_id),
  foreign key (workspace_id, deal_id, company_id) references licihub_crm.deals(workspace_id, id, company_id)
);
create table if not exists licihub_crm.tasks (
  workspace_id uuid not null,
  id uuid not null,
  deal_id uuid not null,
  title text not null check (length(title) between 2 and 200),
  due_at timestamptz not null,
  done boolean not null default false,
  completed_at timestamptz,
  sort_order integer not null check (sort_order >= 0),
  primary key (workspace_id, id),
  foreign key (workspace_id, deal_id) references licihub_crm.deals(workspace_id, id),
  check (done or completed_at is null)
);
create table if not exists licihub_crm.activities (
  workspace_id uuid not null,
  id uuid not null,
  deal_id uuid not null,
  kind text not null,
  body text not null,
  actor_label text not null,
  actor_user_id uuid references auth.users(id),
  created_at timestamptz not null,
  sort_order integer not null check (sort_order >= 0),
  primary key (workspace_id, id),
  foreign key (workspace_id, deal_id) references licihub_crm.deals(workspace_id, id)
);
create table if not exists licihub_crm.quotes (
  workspace_id uuid not null,
  id uuid not null,
  deal_id uuid not null,
  number text not null,
  version integer not null check (version > 0),
  subtotal bigint not null check (subtotal >= 0),
  discount_percent numeric(5,2) not null check (discount_percent between 0 and 100),
  discount_amount bigint not null check (discount_amount between 0 and subtotal),
  tax_percent numeric(5,2) not null check (tax_percent between 0 and 100),
  tax_amount bigint not null check (tax_amount >= 0),
  total bigint not null check (total = subtotal - discount_amount + tax_amount),
  status text not null check (status = 'draft'),
  valid_until date not null,
  terms text not null default '',
  created_at timestamptz not null,
  sort_order integer not null check (sort_order >= 0),
  primary key (workspace_id, id),
  unique (workspace_id, number),
  unique (workspace_id, deal_id, version),
  foreign key (workspace_id, deal_id) references licihub_crm.deals(workspace_id, id)
);
create table if not exists licihub_crm.quote_items (
  workspace_id uuid not null,
  quote_id uuid not null,
  line_number integer not null check (line_number > 0),
  product_id uuid,
  product_name text not null,
  unit_price bigint not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 1000),
  primary key (workspace_id, quote_id, line_number),
  foreign key (workspace_id, quote_id) references licihub_crm.quotes(workspace_id, id),
  foreign key (workspace_id, product_id) references licihub_crm.products(workspace_id, id)
);
create table if not exists licihub_crm.receipts (
  workspace_id uuid not null references licihub_crm.workspaces(id),
  request_id text not null check (length(request_id) between 1 and 125),
  digest text not null check (length(digest) = 64),
  actor_user_id uuid references auth.users(id),
  created_at timestamptz not null default CURRENT_TIMESTAMP,
  sort_order integer not null default 0,
  primary key (workspace_id, request_id)
);
create table if not exists licihub_crm.stage_history (
  workspace_id uuid not null,
  id uuid not null,
  deal_id uuid not null,
  from_stage text,
  to_stage text not null check (to_stage in ('new','contacted','qualified','quoted','followup','won','lost')),
  reason text not null default '',
  actor_user_id uuid references auth.users(id),
  actor_label text not null,
  created_at timestamptz not null,
  primary key (workspace_id, id),
  foreign key (workspace_id, deal_id) references licihub_crm.deals(workspace_id, id)
);
create index if not exists deals_by_owner_stage on licihub_crm.deals(workspace_id, owner_user_id, stage);
create index if not exists tasks_due on licihub_crm.tasks(workspace_id, done, due_at);
create index if not exists prospects_context on licihub_crm.prospects(workspace_id, company_id, convocatoria_id);
create index if not exists activities_by_deal on licihub_crm.activities(workspace_id, deal_id, created_at);
-- END TABLES

do $$ declare t text; begin
  foreach t in array array['workspaces','members','companies','contacts','products','deals','prospects','tasks','activities','quotes','quote_items','receipts','stage_history'] loop
    execute format('alter table licihub_crm.%I enable row level security', t);
    execute format('revoke all on licihub_crm.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update on licihub_crm.%I to service_role', t);
  end loop;
end $$;
grant usage on schema licihub_crm to service_role;
commit;
