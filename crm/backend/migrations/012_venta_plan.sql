-- Permite prospectos tipo 'sale' (ventas de plan LiciHub vía Stripe).
-- Ejecutar en el SQL Editor de Supabase después de 002/008. Idempotente.
begin;
do $$
declare
  restriccion record;
begin
  for restriccion in
    select c.conname from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'licihub_crm.prospectos'::regclass
      and c.contype = 'c'
      and a.attname = 'tipo'
      and cardinality(c.conkey) = 1
  loop
    execute format('alter table licihub_crm.prospectos drop constraint %I', restriccion.conname);
  end loop;
  alter table licihub_crm.prospectos
    add constraint prospectos_tipo_check
    check (tipo in ('signal', 'advice', 'quote', 'manual', 'sale'));
end $$;
notify pgrst, 'reload schema';
commit;
