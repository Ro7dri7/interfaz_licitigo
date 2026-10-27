-- Habilita Telegram como origen. Ejecutar después de 002/003; compatible con 006/007.
-- Conserva los datos y las políticas de acceso. Puede ejecutarse nuevamente.
begin;
do $$
declare
  tabla text;
  restriccion record;
begin
  foreach tabla in array array['empresas','negocios','prospectos'] loop
    for restriccion in
      select c.conname from pg_constraint c
      join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
      where c.conrelid=format('licihub_crm.%I',tabla)::regclass
        and c.contype='c' and a.attname='origen' and cardinality(c.conkey)=1
    loop
      execute format('alter table licihub_crm.%I drop constraint %I',tabla,restriccion.conname);
    end loop;
    execute format('alter table licihub_crm.%I add constraint %I check (origen in (''Lici'',''Telegram'',''WhatsApp'',''Referido'',''Campaña'',''Manual'',''Partner''))',tabla,tabla || '_origen_check');
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
