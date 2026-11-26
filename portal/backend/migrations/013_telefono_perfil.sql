-- Teléfono del cliente en el perfil (registro con correo o Google).
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
begin;

alter table public.perfiles
  add column if not exists telefono text;

comment on column public.perfiles.telefono is 'Teléfono del titular de la cuenta (registro / Google).';

notify pgrst, 'reload schema';
commit;
