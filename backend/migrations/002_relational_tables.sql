-- LiciHub: modelo relacional en español. Ejecutar antes de 003.
-- No modifica tablas compartidas ni registros del portal. No requiere 001.
begin;
create schema if not exists licihub_crm;
revoke all on schema licihub_crm from public, anon, authenticated;

-- INICIO TABLAS (también genera el esquema compatible de la demo SQLite).
do $$ begin
  if to_regclass('licihub_crm.workspaces') is not null then
    raise exception 'Ejecuta primero 005_traducir_esquema_existente.sql; se conservan los datos anteriores';
  end if;
end $$;

create table if not exists licihub_crm.espacios (
  id uuid primary key,
  nombre text not null check (length(nombre) between 2 and 160),
  revision bigint not null default 0 check (revision >= 0),
  creado_en timestamptz not null default CURRENT_TIMESTAMP
);
create table if not exists licihub_crm.miembros (
  espacio_id uuid not null references licihub_crm.espacios(id),
  usuario_id uuid not null references auth.users(id),
  nombre_visible text not null check (length(nombre_visible) between 2 and 100),
  rol text not null check (rol in ('admin','commercial')),
  activo boolean not null default true,
  primary key (espacio_id, usuario_id)
);
create table if not exists licihub_crm.empresas (
  espacio_id uuid not null references licihub_crm.espacios(id),
  id uuid not null,
  nombre text not null check (length(nombre) between 2 and 160),
  ruc text check (ruc ~ '^[0-9]{11}$'),
  ruc_proveedor varchar(11) references public.proveedores(ruc),
  origen text not null check (origen in ('Lici','WhatsApp','Referido','Campaña','Manual','Partner')),
  creado_en timestamptz not null,
  orden integer not null check (orden >= 0),
  primary key (espacio_id, id),
  unique (espacio_id, ruc),
  check (ruc_proveedor is null or ruc_proveedor = ruc)
);
create table if not exists licihub_crm.contactos (
  espacio_id uuid not null,
  id uuid not null,
  empresa_id uuid not null,
  nombre text not null check (length(nombre) between 1 and 100),
  correo text not null default '',
  telefono text not null default '',
  perfil_portal_id uuid references public.perfiles(id),
  orden integer not null check (orden >= 0),
  primary key (espacio_id, id),
  unique (espacio_id, id, empresa_id),
  foreign key (espacio_id, empresa_id) references licihub_crm.empresas(espacio_id, id)
);
create unique index if not exists contactos_identidad_correo on licihub_crm.contactos (espacio_id, empresa_id, lower(correo)) where correo <> '';
create table if not exists licihub_crm.productos (
  espacio_id uuid not null references licihub_crm.espacios(id),
  id uuid not null,
  nombre text not null check (length(nombre) between 2 and 160),
  precio bigint not null check (precio between 0 and 1000000000),
  moneda text not null check (moneda = 'PEN'),
  activo boolean not null default true,
  orden integer not null check (orden >= 0),
  primary key (espacio_id, id)
);
create table if not exists licihub_crm.negocios (
  espacio_id uuid not null,
  id uuid not null,
  empresa_id uuid not null,
  contacto_id uuid,
  servicio text not null check (length(servicio) between 2 and 160),
  origen text not null check (origen in ('Lici','WhatsApp','Referido','Campaña','Manual','Partner')),
  responsable_nombre text not null,
  responsable_usuario_id uuid,
  etapa text not null check (etapa in ('new','contacted','qualified','quoted','followup','won','lost')),
  importe bigint not null check (importe >= 0),
  creado_en timestamptz not null,
  actualizado_en timestamptz not null,
  cerrado_en timestamptz,
  motivo_perdida text not null default '',
  orden integer not null check (orden >= 0),
  primary key (espacio_id, id),
  unique (espacio_id, id, empresa_id),
  foreign key (espacio_id, empresa_id) references licihub_crm.empresas(espacio_id, id),
  foreign key (espacio_id, contacto_id, empresa_id) references licihub_crm.contactos(espacio_id, id, empresa_id),
  foreign key (espacio_id, responsable_usuario_id) references licihub_crm.miembros(espacio_id, usuario_id),
  check (etapa <> 'lost' or length(trim(motivo_perdida)) > 0),
  check (etapa <> 'won' or importe > 0),
  check ((etapa in ('won','lost')) = (cerrado_en is not null))
);
create unique index if not exists negocios_necesidad_abierta_unica on licihub_crm.negocios (espacio_id, empresa_id, lower(servicio)) where etapa not in ('won','lost');
create table if not exists licihub_crm.prospectos (
  espacio_id uuid not null,
  id uuid not null,
  empresa_id uuid not null,
  contacto_id uuid,
  negocio_id uuid,
  tipo text not null check (tipo in ('signal','advice','quote','manual')),
  origen text not null check (origen in ('Lici','WhatsApp','Referido','Campaña','Manual','Partner')),
  servicio text not null check (length(servicio) between 2 and 160),
  responsable_nombre text not null,
  evidencia text not null check (evidencia in ('required','recommended','pending','none')),
  licitacion text not null default '',
  convocatoria_id bigint references public.convocatorias(id),
  analisis_id bigint references public.analisis_empresa_licitacion(id),
  fecha_limite date,
  notas text not null default '',
  creado_en timestamptz not null,
  orden integer not null check (orden >= 0),
  primary key (espacio_id, id),
  foreign key (espacio_id, empresa_id) references licihub_crm.empresas(espacio_id, id),
  foreign key (espacio_id, contacto_id, empresa_id) references licihub_crm.contactos(espacio_id, id, empresa_id),
  foreign key (espacio_id, negocio_id, empresa_id) references licihub_crm.negocios(espacio_id, id, empresa_id)
);
create table if not exists licihub_crm.tareas (
  espacio_id uuid not null,
  id uuid not null,
  negocio_id uuid not null,
  titulo text not null check (length(titulo) between 2 and 200),
  vence_en timestamptz not null,
  completada boolean not null default false,
  completada_en timestamptz,
  orden integer not null check (orden >= 0),
  primary key (espacio_id, id),
  foreign key (espacio_id, negocio_id) references licihub_crm.negocios(espacio_id, id),
  check (completada or completada_en is null)
);
create table if not exists licihub_crm.actividades (
  espacio_id uuid not null,
  id uuid not null,
  negocio_id uuid not null,
  tipo text not null,
  contenido text not null,
  actor_nombre text not null,
  actor_usuario_id uuid references auth.users(id),
  creado_en timestamptz not null,
  orden integer not null check (orden >= 0),
  primary key (espacio_id, id),
  foreign key (espacio_id, negocio_id) references licihub_crm.negocios(espacio_id, id)
);
create table if not exists licihub_crm.cotizaciones (
  espacio_id uuid not null,
  id uuid not null,
  negocio_id uuid not null,
  numero text not null,
  version integer not null check (version > 0),
  subtotal bigint not null check (subtotal >= 0),
  descuento_porcentaje numeric(5,2) not null check (descuento_porcentaje between 0 and 100),
  descuento_importe bigint not null check (descuento_importe between 0 and subtotal),
  impuesto_porcentaje numeric(5,2) not null check (impuesto_porcentaje between 0 and 100),
  impuesto_importe bigint not null check (impuesto_importe >= 0),
  total bigint not null check (total = subtotal - descuento_importe + impuesto_importe),
  estado text not null check (estado = 'draft'),
  vigente_hasta date not null,
  condiciones text not null default '',
  creado_en timestamptz not null,
  orden integer not null check (orden >= 0),
  primary key (espacio_id, id),
  unique (espacio_id, numero),
  unique (espacio_id, negocio_id, version),
  foreign key (espacio_id, negocio_id) references licihub_crm.negocios(espacio_id, id)
);
create table if not exists licihub_crm.partidas_cotizacion (
  espacio_id uuid not null,
  cotizacion_id uuid not null,
  numero_partida integer not null check (numero_partida > 0),
  producto_id uuid,
  producto_nombre text not null,
  precio_unitario bigint not null check (precio_unitario >= 0),
  cantidad integer not null check (cantidad between 1 and 1000),
  primary key (espacio_id, cotizacion_id, numero_partida),
  foreign key (espacio_id, cotizacion_id) references licihub_crm.cotizaciones(espacio_id, id),
  foreign key (espacio_id, producto_id) references licihub_crm.productos(espacio_id, id)
);
create table if not exists licihub_crm.recibos (
  espacio_id uuid not null references licihub_crm.espacios(id),
  solicitud_id text not null check (length(solicitud_id) between 1 and 125),
  huella text not null check (length(huella) = 64),
  actor_usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default CURRENT_TIMESTAMP,
  orden integer not null default 0,
  primary key (espacio_id, solicitud_id)
);
create table if not exists licihub_crm.historial_etapas (
  espacio_id uuid not null,
  id uuid not null,
  negocio_id uuid not null,
  etapa_anterior text,
  etapa_nueva text not null check (etapa_nueva in ('new','contacted','qualified','quoted','followup','won','lost')),
  motivo text not null default '',
  actor_usuario_id uuid references auth.users(id),
  actor_nombre text not null,
  creado_en timestamptz not null,
  primary key (espacio_id, id),
  foreign key (espacio_id, negocio_id) references licihub_crm.negocios(espacio_id, id)
);
create index if not exists negocios_por_responsable_etapa on licihub_crm.negocios(espacio_id, responsable_usuario_id, etapa);
create index if not exists tareas_por_vencimiento on licihub_crm.tareas(espacio_id, completada, vence_en);
create index if not exists prospectos_por_contexto on licihub_crm.prospectos(espacio_id, empresa_id, convocatoria_id);
create index if not exists actividades_por_negocio on licihub_crm.actividades(espacio_id, negocio_id, creado_en);
-- FIN TABLAS

do $$ declare t text; begin
  foreach t in array array['espacios','miembros','empresas','contactos','productos','negocios','prospectos','tareas','actividades','cotizaciones','partidas_cotizacion','recibos','historial_etapas'] loop
    execute format('alter table licihub_crm.%I enable row level security', t);
    execute format('revoke all on licihub_crm.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update on licihub_crm.%I to service_role', t);
  end loop;
end $$;
grant usage on schema licihub_crm to service_role;
commit;
