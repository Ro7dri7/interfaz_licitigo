-- Créditos de desbloqueo y pagos Stripe. Idempotente. No borra filas.
-- Ejecutar en el SQL Editor de Supabase (rol con permiso sobre public).
begin;

alter table public.perfiles
  add column if not exists creditos_desbloqueo integer not null default 5,
  add column if not exists plan_actual text not null default 'free';

create table if not exists public.desbloqueos_usuario (
  id bigserial primary key,
  perfil_id uuid not null references public.perfiles (id),
  nomenclatura_norm text not null,
  created_at timestamptz default now(),
  constraint desbloqueos_usuario_perfil_nomenclatura_key unique (perfil_id, nomenclatura_norm)
);

create table if not exists public.pagos_stripe (
  id bigserial primary key,
  perfil_id uuid not null references public.perfiles (id),
  stripe_session_id text not null unique,
  plan_id text not null,
  creditos_asignados integer not null,
  monto_pen numeric(10, 2) not null,
  estado text not null,
  created_at timestamptz default now()
);

alter table public.desbloqueos_usuario enable row level security;
alter table public.pagos_stripe enable row level security;

grant select, insert, update on public.desbloqueos_usuario to service_role;
grant select, insert, update on public.pagos_stripe to service_role;
grant usage, select on sequence public.desbloqueos_usuario_id_seq to service_role;
grant usage, select on sequence public.pagos_stripe_id_seq to service_role;

-- Descuenta 1 crédito o reutiliza el desbloqueo. También deja la fila en desbloqueos
-- para que el análisis n8n siga el flujo actual.
create or replace function public.consumir_credito_desbloqueo(p_perfil uuid, p_convocatoria bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creditos integer;
  v_ruc text;
  v_nom text;
  v_abierta boolean;
begin
  select creditos_desbloqueo, ruc_empresa
    into v_creditos, v_ruc
  from public.perfiles
  where id = p_perfil
  for update;
  if not found then
    raise exception 'PERFIL_NO_ENCONTRADO';
  end if;

  select coalesce(nullif(btrim(nomenclatura_norm), ''), nullif(btrim(licitacion), '')),
         coalesce(abierta, false)
    into v_nom, v_abierta
  from public.convocatorias
  where id = p_convocatoria;
  if v_nom is null or not v_abierta then
    raise exception 'LICITACION_NO_DISPONIBLE';
  end if;

  if exists (
    select 1 from public.desbloqueos
    where perfil_id = p_perfil and convocatoria_id = p_convocatoria
  ) or exists (
    select 1 from public.desbloqueos_usuario
    where perfil_id = p_perfil and nomenclatura_norm = v_nom
  ) then
    insert into public.desbloqueos_usuario (perfil_id, nomenclatura_norm)
    values (p_perfil, v_nom)
    on conflict (perfil_id, nomenclatura_norm) do nothing;
    insert into public.desbloqueos (perfil_id, convocatoria_id, ruc, estado, intentos)
    values (p_perfil, p_convocatoria, v_ruc, 'pendiente', 0)
    on conflict (perfil_id, convocatoria_id) do nothing;
    return jsonb_build_object('estado', 'ya_desbloqueada', 'creditos', v_creditos, 'nomenclatura', v_nom);
  end if;

  if v_creditos <= 0 then
    return jsonb_build_object('estado', 'sin_creditos', 'creditos', v_creditos, 'nomenclatura', v_nom);
  end if;

  update public.perfiles
    set creditos_desbloqueo = creditos_desbloqueo - 1
    where id = p_perfil
    returning creditos_desbloqueo into v_creditos;

  insert into public.desbloqueos_usuario (perfil_id, nomenclatura_norm)
  values (p_perfil, v_nom);

  insert into public.desbloqueos (perfil_id, convocatoria_id, ruc, estado, intentos)
  values (p_perfil, p_convocatoria, v_ruc, 'pendiente', 0)
  on conflict (perfil_id, convocatoria_id) do nothing;

  return jsonb_build_object('estado', 'descontado', 'creditos', v_creditos, 'nomenclatura', v_nom);
end;
$$;

-- Acredita un Checkout una sola vez. Si stripe_session_id ya existe, devuelve el saldo actual.
create or replace function public.acreditar_pago_stripe(
  p_perfil uuid,
  p_session text,
  p_plan text,
  p_creditos integer,
  p_monto numeric,
  p_estado text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nuevo integer;
  v_saldo integer;
begin
  if p_creditos <= 0 or p_plan is null or p_session is null or p_perfil is null then
    raise exception 'PAGO_INVALIDO';
  end if;
  insert into public.pagos_stripe (
    perfil_id, stripe_session_id, plan_id, creditos_asignados, monto_pen, estado
  ) values (
    p_perfil, p_session, p_plan, p_creditos, p_monto, p_estado
  )
  on conflict (stripe_session_id) do nothing;
  get diagnostics v_nuevo = row_count;
  if v_nuevo = 1 then
    update public.perfiles
      set creditos_desbloqueo = creditos_desbloqueo + p_creditos,
          plan_actual = p_plan
      where id = p_perfil
      returning creditos_desbloqueo into v_saldo;
  else
    select creditos_desbloqueo into v_saldo from public.perfiles where id = p_perfil;
  end if;
  return coalesce(v_saldo, 0);
end;
$$;

revoke all on function public.consumir_credito_desbloqueo(uuid, bigint) from public;
revoke all on function public.acreditar_pago_stripe(uuid, text, text, integer, numeric, text) from public;
grant execute on function public.consumir_credito_desbloqueo(uuid, bigint) to service_role;
grant execute on function public.acreditar_pago_stripe(uuid, text, text, integer, numeric, text) to service_role;

notify pgrst, 'reload schema';

commit;
