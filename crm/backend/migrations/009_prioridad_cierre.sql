-- Prioridad y fecha de cierre esperada de cada negocio. Ejecutar después de 002/003; compatible con 005 a 008.
-- Conserva los datos existentes (todos quedan con prioridad normal y sin fecha). Puede ejecutarse nuevamente.
begin;
alter table licihub_crm.negocios add column if not exists prioridad text not null default 'normal';
alter table licihub_crm.negocios add column if not exists cierre_esperado date;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'negocios_prioridad_check' and conrelid = 'licihub_crm.negocios'::regclass) then
    alter table licihub_crm.negocios add constraint negocios_prioridad_check check (prioridad in ('low','normal','high'));
  end if;
end $$;
notify pgrst,'reload schema';
commit;
