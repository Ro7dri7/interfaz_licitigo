# Activar la base relacional de LiciHub

Actualización 26/10/2026: el flujo vigente centraliza solicitudes explícitas en Negocios y retira Prospectos del menú. Portal y Telegram tienen confirmación y cola de entrega. Aplicar manualmente SQL 008 para el origen Telegram. Supabase ya devuelve versión 2 y 540 productos ISO. [Flujo y activación](ASESORIA_PORTAL_TELEGRAM.md). Las referencias anteriores a señales o 006/007 pendientes corresponden a versiones previas.

Actualizado: 20/10/2026. El usuario ejecutó los scripts y proporcionó el espacio. Se creó `backend/.env` fuera de Git y se verificó por lectura real la conexión, las tres funciones y el espacio vacío, revisión 0. HTTPS local y pantalla de acceso comprobados; el servidor registró posteriormente inicio de sesión y lecturas autenticadas correctos. Falta validar el primer guardado comercial y los distintos roles con cuentas reales. No se cargaron ejemplos ni datos comerciales remotos desde estas verificaciones. La demo SQLite se conserva aparte.

## Ampliación de cotizaciones sobre el espacio ya creado

Para el espacio actual ya provisionado, ejecutar únicamente **[006_cotizaciones_multiples.sql](../backend/migrations/006_cotizaciones_multiples.sql)** y después **[007_catalogo_iso.sql](../backend/migrations/007_catalogo_iso.sql)**. No repetir 004 ni reejecutar 003 después de 006. Detener/reiniciar la API alrededor de la migración y conservar un respaldo. 006 agrega `eventos_cotizacion`, documentos congelados e IGV incluido; 007 incorpora las 540 referencias ISO al UUID actual. Son archivos preparados y probados localmente, pendientes de aplicación remota. [Flujo y comprobación detallados](COTIZACIONES.md).

## 1. Proyecto y orden de ejecución

Usar el proyecto del Portal Clientes React: **`jwxdwszinjdhzoierizm`**, URL `https://jwxdwszinjdhzoierizm.supabase.co`. Los archivos actuales tienen tablas, columnas, funciones, parámetros, variables y mensajes en español. Se conservan las palabras propias de SQL, los objetos de Supabase (`auth.users`, `service_role`, etc.), las variables de configuración y los códigos internos existentes como `commercial`, `signal`, `won` o `draft`. Los textos visibles de la interfaz siguen en español.

**Si todavía no ejecutaste la versión anterior**, abrir **SQL Editor**, crear una consulta y ejecutar el contenido completo de cada archivo, por separado y en este orden:

1. [002_relational_tables.sql](../backend/migrations/002_relational_tables.sql): crea el esquema privado `licihub_crm`, sus 13 tablas, relaciones, índices y restricciones.
2. [003_relational_api.sql](../backend/migrations/003_relational_api.sql): crea validaciones, historial inmutable y las tres funciones que usará el backend para leer, comprobar membresía y guardar una transacción.

**No ejecutar `001_crm.sql`**: corresponde al piloto anterior que guardaba un documento JSONB por espacio. No es requisito de 002/003. Los dos archivos nuevos usan transacciones y pueden repetirse sobre este mismo esquema sin borrar datos; no son un mecanismo para corregir tablas que alguien haya modificado manualmente.

**Si ya ejecutaste 002/003 en inglés:** detener la API del CRM, respaldar la base y ejecutar primero [005_traducir_esquema_existente.sql](../backend/migrations/005_traducir_esquema_existente.sql); después ejecutar los **002 y 003 actuales en español** y usar el backend actualizado. El archivo 005 renombra las tablas/columnas y conserva sus registros, IDs, relaciones, revisión, recibos e historial. Rechaza esquemas mezclados para evitar una fusión accidental. Aunque su número es 005, en esta transición se ejecuta antes de los archivos corregidos; en una instalación nueva no hace falta. Si ya creaste espacio/administrador, conservar su UUID y **no repetir 004**.

La transición requiere la API detenida; no ofrece compatibilidad simultánea con el backend anterior. La reversión está probada: con la API detenida, cambiar `revertir boolean := false` por `true` en una copia de 005 y ejecutar esa copia; reinstalar el 003 anterior conservado en el historial Git junto con el backend anterior. No usar este procedimiento para borrar datos ni modificar tablas del portal. Las copias originales bajo `tests/database/fixtures/` solo sirven para pruebas de compatibilidad; no forman parte de una instalación nueva.

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
-- licihub_crm_guardar, licihub_crm_miembro, licihub_crm_estado.

select
  has_schema_privilege('authenticated', 'licihub_crm', 'USAGE') as cliente_puede_acceder,
  has_function_privilege('anon', 'public.licihub_crm_estado(uuid,text)', 'EXECUTE') as anon_puede_leer,
  has_function_privilege('service_role', 'public.licihub_crm_estado(uuid,text)', 'EXECUTE') as servidor_puede_leer;
-- false, false, true.
```

Si un archivo falla, conservar el error y corregir la causa antes de continuar. No borrar tablas del portal para resolver una clave foránea.

## 2. Crear el espacio y habilitar al administrador

En **Authentication → Users**, localizar la cuenta que administrará el CRM y copiar su UUID. Ser cliente del portal no concede acceso comercial automáticamente.

Abrir [004_provision.example.sql](../backend/migrations/004_provision.example.sql), reemplazar `REEMPLAZAR_POR_UUID_USUARIO_AUTH` por ese UUID y ejecutar la plantilla una sola vez. Crea un espacio vacío y da el rol `admin` únicamente a la cuenta elegida; no cambia su perfil de cliente ni su contraseña. El marcador sin reemplazar debe fallar.

Recuperar el identificador del espacio con esta consulta; **no repetir la plantilla para obtenerlo**, porque crearía otro espacio:

```sql
select id, nombre, revision from licihub_crm.espacios order by creado_en desc;
```

Para añadir posteriormente un asesor, reemplazar los tres valores:

```sql
insert into licihub_crm.miembros(espacio_id, usuario_id, nombre_visible, rol)
values ('UUID_DEL_ESPACIO', 'UUID_DEL_USUARIO_AUTH', 'Nombre del asesor', 'commercial');
```

Solo el administrador puede dar de alta productos desde la API. Por ahora ambos roles comerciales ven todo su espacio; **aún falta el aislamiento por equipo/asesor**. El responsable mostrado sigue siendo texto; la columna para asignar un miembro por UUID está preparada pero la interfaz todavía no la usa.

## 3. Configurar el servidor y verificar

**Ejecutar SQL prepara la base, pero no conecta el CRM automáticamente.** El espacio recién creado está vacío: al completar la configuración y verificar el acceso, el CRM leerá y guardará allí los registros comerciales reales que se ingresen. No se importan la demo, todos los usuarios/proveedores del portal ni negocios del CRM externo. El alta automática de leads desde el botón de asesoría y WhatsApp necesita todavía sus integraciones.

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

Con el entorno propio, usar `backend/.venv/Scripts/python.exe`. El informe muestra proyecto, presencia de funciones, revisión y cantidades de registros; no muestra claves ni datos de clientes. Código de salida 0: funciones y espacio accesibles y esquema de cotizaciones versión 2; 1: preparación incompleta; 2: error de configuración/conexión. `--portal-env` permite comprobar las funciones usando el archivo de configuración existente del portal; no configura el CRM y normalmente no incluye su espacio.

La comprobación real del 20/10 encontró conexión correcta, **ninguna función faltante**, espacio accesible y todas las colecciones comerciales vacías. El comando anterior terminó con código 0; la comprobación actual exige también `schema_version: 2` y `quote_schema_ready: true`, por lo que avisa preparación incompleta mientras falte 006. Esto confirma lectura de la base con la configuración de servidor; todavía no demuestra el acceso mediante la cuenta comercial ni una escritura autenticada.

Servir frontend y `/api/crm` bajo el mismo origen HTTPS. El modo Supabase exige HTTPS por su cookie de sesión segura. Para probar en este equipo sin dominio público, usar `CRM_ORIGIN=https://127.0.0.1:5174`, iniciar `npm run api` y en otra terminal `npm run dev:https`. No combinar protocolos: `https:http://...` es inválido. Abrir exactamente **https://127.0.0.1:5174**.

El comando HTTPS activa `@vitejs/plugin-basic-ssl` solamente para ese servidor de desarrollo. Genera un certificado autofirmado en la caché ignorada `node_modules/.vite/basic-ssl`; el navegador puede mostrar una advertencia. No se cambió el almacén de confianza del sistema. Vite termina TLS y reenvía `/api` a la API HTTP en loopback; las llamadas hacia Supabase mantienen la validación TLS normal. El servidor de desarrollo no debe publicarse como despliegue productivo. Reiniciar la API al cambiar el `.env`.

`npm run dev` conserva el modo HTTP para la demo; no coincide con el origen HTTPS de esta configuración Supabase. Las pruebas usan servidores y datos ficticios separados, y las pruebas Python no leen las credenciales de `backend/.env`.

Referencias: [HTTPS en Vite](https://vite.dev/config/server-options.html#server-https) y [certificado de desarrollo del plugin oficial](https://github.com/vitejs/vite-plugin-basic-ssl).

Verificar antes del piloto: sin sesión → 401; cliente sin membresía → 403; asesor sin permiso de catálogo → 403; administrador habilitado → guardado correcto. Probar revocación de membresía, expiración, dos sesiones que escriban a la vez, reintento sin duplicados y respaldo/restauración. Estas comprobaciones remotas no están sustituidas por las pruebas locales.

## 4. Qué guarda cada tabla y cómo se relaciona con el portal

| Tabla en `licihub_crm` | Contenido y relación |
|---|---|
| `espacios`, `miembros` | Equipo comercial y acceso explícito mediante `auth.users.id` |
| `empresas` | Empresa comercial, RUC único dentro del espacio; enlace opcional a `public.proveedores.ruc` |
| `contactos` | Contactos de una empresa; enlace opcional a `public.perfiles.id` |
| `prospectos` | Señal, asesoría, cotización o entrada manual; contexto y enlaces opcionales a convocatoria/análisis |
| `negocios` | Negocio con empresa, contacto, servicio, etapa e importe comercial |
| `productos` | Catálogo comercial propio del espacio |
| `cotizaciones`, `partidas_cotizacion` | Versiones de propuesta y hasta 50 partidas con nombre/precio históricos |
| `eventos_cotizacion` (006) | Envío, aceptación o rechazo, destinatario/canal/evidencia y actor; registros inmutables |
| `tareas`, `actividades` | Próxima acción y registro histórico de la gestión |
| `historial_etapas` | Transiciones de etapa con actor por UUID y nombre |
| `recibos` | Identificador y huella de cada operación, para reintentar sin duplicar |

Si el RUC ya existe en `proveedores`, la empresa comercial se enlaza automáticamente. Si no existe, puede registrarse igual y el enlace queda vacío: no se inventa un proveedor. Un vínculo a perfil debe corresponder al RUC de la empresa; un análisis debe corresponder a la empresa y la convocatoria. Las claves compuestas impiden mezclar contactos/negocios entre empresas o espacios.

Las columnas de perfil, convocatoria y análisis ya tienen sus restricciones en PostgreSQL, pero **el emisor del portal y el contrato para enviar esos IDs todavía están pendientes**. Hoy se recibe el contexto textual del contrato de [INTEGRACIONES.md](INTEGRACIONES.md). Tampoco está implementado el botón de asesoría, la bandeja WhatsApp, 360dialog ni el bot n8n.

Una señal conserva su tipo sin abrir una venta. Solicitar asesoría/cotización abre o vincula un negocio compatible. El guardado envía únicamente las filas cambiadas; filas, recibo e historial se confirman o revierten juntas. Las cotizaciones y actividades guardadas son inmutables. La ampliación 006 permite varias partidas por versión y conserva el estado mediante eventos inmutables. Los precios ISO se consideran con IGV incluido; las propuestas anteriores conservan su cálculo original.

RLS y la ausencia de permisos bloquean acceso directo de `anon`/`authenticated`; solo el backend usa las funciones de servicio. **La clave de servicio puede omitir RLS**: la protección comercial depende también de validar sesión/membresía en la API y de los controles de membresía/rol dentro de la transacción SQL. No exponer esa clave.

## 5. Demo local, conservación de datos y límites

La demo usa `backend/data/demo.sqlite3`. La primera inicialización importa el antiguo `backend/data/demo.json`, si existe; conserva sus identificadores, revisión, propuestas y recibos y deja el JSON original intacto. Arranques posteriores usan SQLite. Un JSON inválido detiene la importación; no se sustituye silenciosamente por ejemplos nuevos. Configuraciones antiguas `CRM_DATA_FILE=...json` importan hacia el archivo `.sqlite3` del mismo nombre. Una ruta SQLite nueva permite crear otra demo independiente.

La demo SQLite y el contrato interno React conservan sus identificadores técnicos anteriores para abrir los datos ya guardados sin convertirlos. El adaptador traduce al español al comunicarse con PostgreSQL; esta compatibilidad no crea tablas duplicadas en Supabase.

Detener la API antes de respaldar la demo y copiar el archivo `.sqlite3` junto con sus archivos `-wal`/`-shm` si existen. El JSON original es una copia histórica: **no incluye los cambios posteriores al paso a SQLite**. La demo sigue restringida al equipo local y sus datos ficticios no se cargan en Supabase.

La persistencia ya está normalizada, pero la API conserva la lectura completa del espacio y una revisión global: dos cambios simultáneos pueden producir 409 aunque sean de negocios distintos. Faltan consultas paginadas, concurrencia por entidad, asignación y visibilidad por asesor, retención de recibos y pruebas de carga. No hay sincronización en tiempo real. SQLite sirve para revisar el desarrollo local; las pruebas PostgreSQL se ejecutan aparte con PGlite y un esquema mínimo de portal/Auth.

Ante un fallo de activación, detener el servicio y revertir su configuración conservando la base y sus respaldos. Volver a `CRM_MODE=demo` abre únicamente los datos locales; no trae datos remotos. No hacer rollback borrando usuarios, tablas compartidas ni registros comerciales.
