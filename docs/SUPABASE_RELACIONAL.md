# Activar la base relacional de LiciHub

Actualizado: 19/10/2026. El usuario ejecutará los archivos SQL personalmente. **No se ha aplicado SQL ni cargado datos comerciales en Supabase desde esta entrega.** La interfaz funciona localmente con SQLite relacional.

## 1. Proyecto y orden de ejecución

Usar el proyecto del Portal Clientes React: **`jwxdwszinjdhzoierizm`**, URL `https://jwxdwszinjdhzoierizm.supabase.co`. En Supabase, abrir **SQL Editor**, crear una consulta y ejecutar el contenido completo de cada archivo, por separado y en este orden:

1. [002_relational_tables.sql](../backend/migrations/002_relational_tables.sql): crea el esquema privado `licihub_crm`, sus 13 tablas, relaciones, índices y restricciones.
2. [003_relational_api.sql](../backend/migrations/003_relational_api.sql): crea validaciones, historial inmutable y las tres funciones que usará el backend para leer, comprobar membresía y guardar una transacción.

**No ejecutar `001_crm.sql`**: corresponde al piloto anterior que guardaba un documento JSONB por espacio. No es requisito de 002/003. Los dos archivos nuevos usan transacciones y pueden repetirse sobre este mismo esquema sin borrar datos; no son un mecanismo para corregir tablas que alguien haya modificado manualmente.

La inspección remota de solo lectura confirmó las tablas compartidas `proveedores`, `perfiles`, `convocatorias`, `desbloqueos` y `analisis_empresa_licitacion`. También existen `public.crm_negocios` y `public.productos_iso`, vacías en esa inspección. **Se conservan todas**: no se renombran, alteran ni borran. No se importa información del CRM de referencia ni de HubSpot. Antes de usar datos reales, ensayar las migraciones y la restauración en un entorno de prueba con ese esquema compartido.

Comprobar después de ambos archivos:

```sql
select tablename, rowsecurity
from pg_tables where schemaname = 'licihub_crm'
order by tablename;
-- 13 tablas; rowsecurity = true en todas.

select routine_name
from information_schema.routines
where routine_schema = 'public' and routine_name like 'licihub_crm_%'
order by routine_name;
-- licihub_crm_commit, licihub_crm_member, licihub_crm_state.

select
  has_schema_privilege('authenticated', 'licihub_crm', 'USAGE') as cliente_puede_acceder,
  has_function_privilege('anon', 'public.licihub_crm_state(uuid,text)', 'EXECUTE') as anon_puede_leer,
  has_function_privilege('service_role', 'public.licihub_crm_state(uuid,text)', 'EXECUTE') as servidor_puede_leer;
-- false, false, true.
```

Si un archivo falla, conservar el error y corregir la causa antes de continuar. No borrar tablas del portal para resolver una clave foránea.

## 2. Crear el espacio y habilitar al administrador

En **Authentication → Users**, localizar la cuenta que administrará el CRM y copiar su UUID. Ser cliente del portal no concede acceso comercial automáticamente.

Abrir [004_provision.example.sql](../backend/migrations/004_provision.example.sql), reemplazar `REEMPLAZAR_POR_UUID_USUARIO_AUTH` por ese UUID y ejecutar la plantilla una sola vez. Crea un espacio vacío y da el rol `admin` únicamente a la cuenta elegida; no cambia su perfil de cliente ni su contraseña. El marcador sin reemplazar debe fallar.

Recuperar el identificador del espacio con esta consulta; **no repetir la plantilla para obtenerlo**, porque crearía otro espacio:

```sql
select id, name, revision from licihub_crm.workspaces order by created_at desc;
```

Para añadir posteriormente un asesor, reemplazar los tres valores:

```sql
insert into licihub_crm.members(workspace_id, user_id, display_name, role)
values ('UUID_DEL_ESPACIO', 'UUID_DEL_USUARIO_AUTH', 'Nombre del asesor', 'commercial');
```

Solo el administrador puede dar de alta productos desde la API. Por ahora ambos roles comerciales ven todo su espacio; **aún falta el aislamiento por equipo/asesor**. El responsable mostrado sigue siendo texto; la columna para asignar un miembro por UUID está preparada pero la interfaz todavía no la usa.

## 3. Configurar el servidor y verificar

Copiar `backend/.env.example` a `backend/.env` si no existe y completar localmente:

```dotenv
CRM_MODE=supabase
CRM_ORIGIN=https://DOMINIO_DEL_CRM
CRM_SUPABASE_URL=https://jwxdwszinjdhzoierizm.supabase.co
CRM_SUPABASE_SECRET_KEY=CLAVE_DE_SERVIDOR
CRM_WORKSPACE_ID=UUID_DEL_ESPACIO
```

La clave debe ser de servidor, compatible con `service_role`. Guardarla solo en el backend; nunca en React, variables `VITE_*`, Git ni mensajes de chat. Se pueden usar claves secretas nuevas o la clave JWT de servicio anterior. La aplicación no copia automáticamente la configuración del portal.

Desde la carpeta `lici-crm`, comprobar sin modificar registros:

```powershell
& '..\interfaz_licitigo\backend\.venv\Scripts\python.exe' scripts/supabase_status.py
```

Con el entorno propio, usar `backend/.venv/Scripts/python.exe`. El informe muestra proyecto, presencia de funciones, revisión y cantidades de registros; no muestra claves ni datos de clientes. Código de salida 0: funciones y espacio accesibles; 1: preparación incompleta; 2: error de configuración/conexión. `--portal-env` permite comprobar las funciones usando el archivo de configuración existente del portal; no configura el CRM y normalmente no incluye su espacio.

La última comprobación real encontró conexión correcta, pero **faltan las tres funciones y el espacio comercial todavía no está configurado**. Después del SQL, este resultado debe cambiar.

Servir frontend y `/api/crm` bajo el mismo origen HTTPS. El modo Supabase exige HTTPS por su cookie de sesión segura; `http://127.0.0.1:5174` continúa siendo la demo local, no una sesión Supabase. Reiniciar la API después de cambiar configuración. El despliegue HTTPS y las pruebas de Supabase Auth con cuentas reales siguen pendientes.

Verificar antes del piloto: sin sesión → 401; cliente sin membresía → 403; asesor sin permiso de catálogo → 403; administrador habilitado → guardado correcto. Probar revocación de membresía, expiración, dos sesiones que escriban a la vez, reintento sin duplicados y respaldo/restauración. Estas comprobaciones remotas no están sustituidas por las pruebas locales.

## 4. Qué guarda cada tabla y cómo se relaciona con el portal

| Tabla en `licihub_crm` | Contenido y relación |
|---|---|
| `workspaces`, `members` | Equipo comercial y acceso explícito mediante `auth.users.id` |
| `companies` | Empresa comercial, RUC único dentro del espacio; enlace opcional a `public.proveedores.ruc` |
| `contacts` | Contactos de una empresa; enlace opcional a `public.perfiles.id` |
| `prospects` | Señal, asesoría, cotización o entrada manual; contexto y enlaces opcionales a convocatoria/análisis |
| `deals` | Negocio con empresa, contacto, servicio, etapa e importe comercial |
| `products` | Catálogo comercial propio del espacio |
| `quotes`, `quote_items` | Versiones de propuesta y su partida con nombre/precio históricos |
| `tasks`, `activities` | Próxima acción y registro histórico de la gestión |
| `stage_history` | Transiciones de etapa con actor por UUID y nombre |
| `receipts` | Identificador y huella de cada operación, para reintentar sin duplicar |

Si el RUC ya existe en `proveedores`, la empresa comercial se enlaza automáticamente. Si no existe, puede registrarse igual y el enlace queda vacío: no se inventa un proveedor. Un vínculo a perfil debe corresponder al RUC de la empresa; un análisis debe corresponder a la empresa y la convocatoria. Las claves compuestas impiden mezclar contactos/negocios entre empresas o espacios.

Las columnas de perfil, convocatoria y análisis ya tienen sus restricciones en PostgreSQL, pero **el emisor del portal y el contrato para enviar esos IDs todavía están pendientes**. Hoy se recibe el contexto textual del contrato de [INTEGRACIONES.md](INTEGRACIONES.md). Tampoco está implementado el botón de asesoría, la bandeja WhatsApp, 360dialog ni el bot n8n.

Una señal conserva su tipo sin abrir una venta. Solicitar asesoría/cotización abre o vincula un negocio compatible. El guardado envía únicamente las filas cambiadas; filas, recibo e historial se confirman o revierten juntas. Las cotizaciones y actividades guardadas son inmutables. La interfaz mantiene una partida por versión, aunque encabezado y partida están separados.

RLS y la ausencia de permisos bloquean acceso directo de `anon`/`authenticated`; solo el backend usa las funciones de servicio. **La clave de servicio puede omitir RLS**: la protección comercial depende también de validar sesión/membresía en la API y de los controles de membresía/rol dentro de la transacción SQL. No exponer esa clave.

## 5. Demo local, conservación de datos y límites

La demo usa `backend/data/demo.sqlite3`. La primera inicialización importa el antiguo `backend/data/demo.json`, si existe; conserva sus identificadores, revisión, propuestas y recibos y deja el JSON original intacto. Arranques posteriores usan SQLite. Un JSON inválido detiene la importación; no se sustituye silenciosamente por ejemplos nuevos. Configuraciones antiguas `CRM_DATA_FILE=...json` importan hacia el archivo `.sqlite3` del mismo nombre. Una ruta SQLite nueva permite crear otra demo independiente.

Detener la API antes de respaldar la demo y copiar el archivo `.sqlite3` junto con sus archivos `-wal`/`-shm` si existen. El JSON original es una copia histórica: **no incluye los cambios posteriores al paso a SQLite**. La demo sigue restringida al equipo local y sus datos ficticios no se cargan en Supabase.

La persistencia ya está normalizada, pero la API conserva la lectura completa del espacio y una revisión global: dos cambios simultáneos pueden producir 409 aunque sean de negocios distintos. Faltan consultas paginadas, concurrencia por entidad, asignación y visibilidad por asesor, retención de recibos y pruebas de carga. No hay sincronización en tiempo real. SQLite sirve para revisar el desarrollo local; las pruebas PostgreSQL se ejecutan aparte con PGlite y un esquema mínimo de portal/Auth.

Ante un fallo de activación, detener el servicio y revertir su configuración conservando la base y sus respaldos. Volver a `CRM_MODE=demo` abre únicamente los datos locales; no trae datos remotos. No hacer rollback borrando usuarios, tablas compartidas ni registros comerciales.
