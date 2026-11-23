# Estado del sistema LiciHub

Revisión del 22 nov 2026, después del sprint de equipo, ingesta y limpieza de la demo. React habla solo con FastAPI (`/api/*`). La clave de Supabase no sale del servidor.

## Arquitectura

Un origen HTTPS local y dos APIs.

| Pieza | Dónde | Puerto |
|---|---|---|
| Portal + CRM (Vite, certificado local) | `portal/` | `https://127.0.0.1:5174` |
| API del portal (FastAPI) | `portal/backend` | `http://127.0.0.1:8000` |
| API del CRM (FastAPI) | `crm/backend` | `http://127.0.0.1:8001` |
| Bot de Telegram | proceso aparte, `npm run bot` | sin puerto público |

Vite, con `LICIHUB_UNIFIED=1`, envía `/api/crm` a `8001` y el resto de `/api` a `8000`. El navegador ve un solo sitio: `https://127.0.0.1:5174`. El CRM vive en `/comercial`.

Flujo de datos:

1. El scraper en AWS hace upsert en Supabase (`public.convocatorias` y tablas hijas: `documentos_proceso`, `items_proceso`, `cronograma_proceso`, `proveedores`).
2. El portal lee y escribe con la clave de servidor por PostgREST y RPC (`buscar_licitaciones`, `historial_empresa`, `guardar_perfil_empresa`). No hay `DATABASE_URL`.
3. React pide licitaciones, perfil, desbloqueos y sesión a la API del portal.
4. Al desbloquear, la API inserta `desbloqueos` y, si hay `N8N_WEBHOOK_URL`, llama a n8n. n8n guarda el análisis en `analisis_empresa_licitacion` / `desbloqueos.resultado`. Sin webhook el desbloqueo queda en `sin_analisis`.
5. Una asesoría entra en una cola SQLite del portal y se reenvía a `POST /api/crm/events` con `X-CRM-Ingest-Key`. El CRM crea empresa, contacto, prospecto, negocio y tarea en `licihub_crm`.
6. El bot (mismo proyecto de Supabase) envía alertas según `telegram_suscripciones` y arma las solicitudes de Telegram con el mismo evento. Tiene que estar encendido: `npm run bot`.
7. El login de `/ingresar` mira `licihub_crm.miembros` del `CRM_WORKSPACE_ID`. Admin y comercial reciben las cookies `lici_crm_session` y `lici_crm_refresh`. El cliente entra al portal.

Para que el panel de equipo lea y escriba miembros en producción hay que ejecutar `crm/backend/migrations/011_equipo.sql` en el SQL Editor. Hasta entonces la lista responde error de almacenamiento y los asesores del formulario quedan vacíos en modo Supabase.

## Endpoints activos

### Portal

- `GET /api/health`
- `GET /api/estadisticas`
- `GET /api/empresas/{ruc}` (exige sesión)
- `GET /api/terminos`
- `GET /api/keywords/conteo`
- `GET /api/perfil` · `PUT /api/perfil` · `POST /api/perfil/empresa/actualizar` · `GET /api/perfil/historial`
- `GET /api/licitaciones`
- `POST /api/licitaciones/{id}/desbloquear` · `GET /api/licitaciones/{id}/desbloqueo` · `POST /api/licitaciones/{id}/reanalizar`
- `GET /api/desbloqueos`
- `POST /api/asesorias`
- `GET /api/alertas/telegram` · `POST /api/alertas/telegram` · `DELETE /api/alertas/telegram`

### Auth

- `POST /api/auth/registro` · `POST /api/auth/login` · `POST /api/auth/refresh` · `POST /api/auth/logout`
- `POST /api/auth/otp` · `POST /api/auth/otp/verificar`
- `POST /api/auth/recuperar` · `POST /api/auth/restablecer`
- `GET /api/auth/google` · `GET /api/auth/google/callback` · `POST /api/auth/ticket`

### CRM

- `GET /api/crm/session` · `GET /api/crm/state`
- `POST /api/crm/login` · `POST /api/crm/logout`
- `POST /api/crm/commands` (negocios, contactos, tareas, actividades, cotizaciones, catálogo, propiedades)
- `POST /api/crm/events` (portal y Telegram; sin clave responde `crm_ingest_disabled`; sin la migración 008 responde `crm_telegram_schema_missing`)

### Admin

Misma API del CRM. Solo un miembro `admin` activo pasa estas acciones; un `commercial` recibe 403.

- `GET /api/crm/team`
- `POST /api/crm/team` (alta por correo, buscando el usuario en `GET /auth/v1/admin/users`)
- `POST /api/crm/team/acceso` (rol y `activo`; el único admin activo no puede quitarse el acceso)
- En `POST /api/crm/commands`: `product`, `import_iso` y `property_*`

`/api/crm/session` en modo Supabase devuelve como `advisors` los nombres de los miembros activos. En el espacio de prueba local siguen los dos nombres de la demo, porque Playwright los busca y ahí no hay `auth.users`.

## Pruebas de esta corrida

| Suite | Resultado |
|---|---|
| `npm run test:portal` | 29 pruebas, OK |
| `npm run test:crm` | 80 pruebas, OK |
| `npx tsc -b --noEmit` en `portal/` | OK |
| `npx tsc -b --noEmit` en `crm/` | OK |

El proceso `npm start` que ya estaba abierto no recarga Python. Hay que detenerlo y volver a lanzarlo para ver el equipo, la reasignación de responsable y la limpieza del portal.
