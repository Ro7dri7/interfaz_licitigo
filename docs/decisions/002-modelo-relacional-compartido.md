# ADR-002: entidades comerciales en el mismo Supabase del portal

Fecha: 2026-10-19. Estado: implementado y probado localmente; ejecución remota manual pendiente. Sustituye la decisión de persistencia JSON/JSONB de [ADR-001](001-piloto-comercial.md).

Corrección solicitada por el usuario: identificadores del SQL/PostgreSQL en español, con adaptación en el límite Supabase. El contrato React y la demo SQLite existente se conservan para evitar una migración local innecesaria. Se corrigieron los scripts antes de activar el servicio remoto; para quien ya hubiera aplicado sus versiones anteriores, 005 permite una transición con API detenida y reversión probada, seguida de reinstalar las funciones correspondientes. No se plantea un cambio de nombres durante un despliegue con versiones simultáneas.

## Contexto y decisión

El usuario aprobó comenzar la base relacional y eligió ejecutar el SQL personalmente. La inspección de solo lectura confirmó el proyecto del portal y sus claves reales, además de tablas comerciales anteriores vacías. Usar el mismo proyecto permite enlazar identidades, empresas y análisis sin sincronizar dos bases ni otorgar acceso comercial a todos los clientes.

Crear un esquema privado `licihub_crm` con tablas por entidad, claves compuestas por espacio, índices y restricciones. Conservar las tablas públicas compartidas y las comerciales anteriores. Enlazar proveedores por RUC y preparar referencias opcionales a perfiles, convocatorias y análisis. No crear filas de proveedor para satisfacer una referencia.

Las escrituras pasan por funciones de servicio en PostgreSQL: aplican solo filas cambiadas, verifican membresía activa y rol de catálogo, bloquean la revisión del espacio y guardan recibo e historial en la misma transacción. Las propuestas/versiones, partidas, actividades, recibos e historial de etapas no se modifican una vez guardados. Los precios están en céntimos. La lectura agrupa filas en el contrato actual de la interfaz; ese JSON es una respuesta, no un documento guardado.

La API valida la sesión Supabase y la membresía antes de acceder. RLS habilitado sin permisos a clientes impide acceso directo; la credencial de servicio permanece exclusivamente en servidor y puede omitir RLS. No se expone el esquema privado por PostgREST ni se permite llamar a sus funciones con la clave pública.

La demo utiliza SQLite con claves foráneas y transacciones. Reutiliza las definiciones de tablas de la migración PostgreSQL con adaptación de tipos y referencias externas locales vacías. Importa una sola vez el JSON anterior sin modificarlo; si está corrupto, falla sin sembrar otro conjunto. No simula Supabase Auth ni importa datos del portal.

## Consecuencias y trabajo restante

Se conserva el contrato de comandos y la interfaz existente para poder verificar el mismo flujo. Aún se lee el espacio completo y se compara una revisión global; faltan paginación, concurrencia por entidad y retención de recibos. La cotización sigue admitiendo una partida y la asignación sigue siendo texto. Los roles comerciales ven el espacio completo; falta la política por asesor/equipo.

No se migran datos remotos desde el antiguo documento JSONB porque ese esquema no se encontró en el proyecto inspeccionado. No se suben semillas ni ejemplos locales. Si se descubre un piloto remoto con datos, requiere exportación y conciliación explícitas antes de cambiarlo.

Pruebas separadas verifican dominio/API/SQLite, adaptador HTTP y PostgreSQL real embebido mediante PGlite con tablas mínimas de portal/Auth. Esto no sustituye aplicar SQL y comprobar sesiones, permisos y respaldo en Supabase. Orden de archivos y activación en [SUPABASE_RELACIONAL.md](../SUPABASE_RELACIONAL.md).
