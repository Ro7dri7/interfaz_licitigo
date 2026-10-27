# Integraciones y activación

## Supabase: preparación disponible

El proyecto vigente del Portal Clientes React es `jwxdwszinjdhzoierizm`. La persistencia vigente usa el esquema privado `licihub_crm`, con 13 tablas iniciales, claves al portal y funciones de servicio. El usuario aplicó 002/003 y provisionó el espacio; se verificó lectura real sin cambios. La lectura del 26/10 confirmó versión 2 y 540 productos ISO, por lo que 006/007 ya están reflejados en la base. La nueva migración **008_origen_telegram.sql** debe ejecutarse manualmente para admitir Telegram como origen. [Cotizaciones y activación](COTIZACIONES.md). Orden, plantilla de administrador y comprobaciones en [SUPABASE_RELACIONAL.md](SUPABASE_RELACIONAL.md).

1. Ejecutar `backend/migrations/002_relational_tables.sql` y después `003_relational_api.sql`. No ejecutar el histórico `001_crm.sql`.
2. Personalizar `004_provision.example.sql` con el UUID del administrador elegido en Supabase Auth y ejecutarlo una sola vez para crear el espacio vacío y su membresía.
3. Registrar otros miembros con IDs reales de Supabase Auth. Ejemplo para sustituir los marcadores:

```sql
insert into licihub_crm.miembros (espacio_id, usuario_id, nombre_visible, rol)
values ('UUID_DEL_ESPACIO', 'UUID_DEL_USUARIO_AUTH', 'Nombre del asesor', 'commercial');
```

4. Configurar en el servidor `CRM_MODE=supabase`, `CRM_ORIGIN=https://dominio-del-crm`, `CRM_SUPABASE_URL`, `CRM_SUPABASE_SECRET_KEY` (clave de servidor compatible con service_role) y `CRM_WORKSPACE_ID`.
5. Servir frontend y `/api/crm` en el mismo origen HTTPS. La clave de servicio nunca se entrega a React. RLS está habilitado y anon/authenticated no tienen acceso directo a tablas ni a las funciones `licihub_crm_estado`, `licihub_crm_miembro`, `licihub_crm_guardar`; el backend valida JWT y membresía activa antes de cada lectura o comando. La función de guardado comprueba otra vez membresía y permiso de catálogo. La clave de servicio omite RLS y permanece solo en servidor.
6. Verificar con cuentas reales: sin sesión → 401; cliente ajeno al CRM → 403; asesor → espacio completo pero no alta de productos; administrador → catálogo. Probar expiración, revocación de membresía, escrituras simultáneas, respaldo y restauración. Estas verificaciones remotas siguen pendientes.

El adaptador no carga semillas ficticias en Supabase. La creación de espacio vacío y miembros es separada. Ante un despliegue fallido, detener el servicio CRM y revertir su configuración; conservar tablas y respaldo para evitar pérdida. No borrar tablas compartidas ni usuarios de Lici como rollback.

## Contrato Portal / Telegram → CRM

`POST /api/crm/events`, de servidor a servidor. Cabecera `X-CRM-Ingest-Key` con secreto independiente configurado como `CRM_INGEST_KEY`. Sin ese valor, responde 503 (integración deshabilitada). No colocar esta clave en el navegador ni reutilizar el token Telegram.

```json
{
  "requestId": "evento-estable-de-lici-001",
  "payload": {
    "company": "Empresa de ejemplo",
    "ruc": "20123456789",
    "contact": "Ana Ejemplo",
    "email": "ana@example.com",
    "phone": "",
    "origin": "Lici",
    "kind": "advice",
    "service": "ISO 9001",
    "owner": "Sin asignar",
    "evidence": "required",
    "tender": "LP-EJEMPLO-001",
    "deadline": "2026-12-31",
    "notes": "El cliente confirmó que quiere comunicarse con un asesor desde la licitación desbloqueada."
  }
}
```

`kind`: solo `advice` (asesoría) o `quote` (cotización). `evidence`: `required`, `recommended`, `pending`, `none`. El canal de integración acepta `origin=Lici` para el portal y `origin=Telegram` para el bot. Empresa y servicio son obligatorios; RUC/contacto pueden faltar en el contrato general, pero el emisor actual requiere cuenta con RUC y obtiene los datos en servidor. No se aceptan señales automáticas ni registros manuales sin intención confirmada. El RUC suministrado tiene 11 dígitos; el formato no acredita validez ante SUNAT.

Reglas de vinculación:

- Empresa por RUC exacto no vacío. Contacto por correo dentro de su empresa. Sin RUC no se asume identidad por razón social.
- Negocio abierto compatible = misma empresa y mismo texto de servicio, sin distinguir mayúsculas. Los alias de servicios aún requieren un catálogo de correspondencias en el emisor.
- Solicitud explícita crea/vincula negocio y tarea inicial de atención a 24 horas si abre negocio. Una señal aislada no crea negocio.
- Se conserva el historial previo, incluidas señales históricas ya vinculadas. No se reciben señales nuevas por la integración. Cada solicitud nueva conserva origen y contexto en la ficha; el primer origen del negocio no se sobrescribe.
- Un negocio ganado/perdido no se reutiliza automáticamente ante una nueva solicitud; se abre otro. No puede reconvertirse un prospecto ya asociado: se abre su ficha o se registra una nueva entrada.

Respuesta: `{"accepted":true,"duplicate":false}` o `duplicate:true` para repetición idéntica. Repetir **el mismo requestId y payload** permite reintentar tras timeout sin duplicar. Cambiar el payload con el mismo ID devuelve 422; la actualización tardía de análisis necesita un contrato adicional aún pendiente. No reenviar como si fuera el mismo evento modificado.

Errores: 401 clave inválida; 422 entrada inválida/conflicto de ID; 409 conflicto de revisión tras tres intentos internos; 413 cuerpo >64 KiB; 503 deshabilitado/almacenamiento no disponible. El emisor debe guardar los eventos en outbox, reintentar timeouts/409/503 con backoff y alertar sobre errores definitivos. El emisor ya está implementado en `portal/backend/app/asesorias.py`, con cola SQLite persistente y recuperación operativa. La prueba remota requiere activar SQL 008 y el proceso del bot; [flujo vigente](ASESORIA_PORTAL_TELEGRAM.md).

## API de la interfaz

`GET /api/crm/session`, `POST /api/crm/login`, `POST /api/crm/logout`, `GET /api/crm/state` y `POST /api/crm/commands`. Documentación de transporte en `/docs` de FastAPI. Los modelos específicos de cada operación están en `backend/domain.py`.

Comandos: `intake`, `convert`, `stage`, `activity`, `task`, `complete_task`, `product`, `import_iso`, `quote`, `quote_status`. La sesión incluye los datos del emisor y los dos asesores ficticios; el estado incluye `schemaVersion`. Los comandos de cotización requieren versión 2 (migración 006). `import_iso` requiere administración; `quote_status` registra acciones externas, sin realizar envíos. El cuerpo contiene `revision`, `requestId`, `operation`, `payload`. El servidor valida las operaciones y aplica el cambio atómicamente; 409 obliga a refrescar y reintentar. La interfaz conserva un identificador para reintentar el formulario. Los recibos de idempotencia no se exponen al cliente.

Las escrituras de interfaz requieren la cabecera Origin exacta. El receptor de eventos usa su propia credencial. Los importes de respuesta se expresan en **céntimos PEN**; al crear producto, `price` se introduce en soles. Las tareas requieren datetime con zona y se almacenan en UTC; la interfaz muestra Perú.

## Telegram

El bot de `../portal/backend/app/bot.py` ahora admite `/asesor` y confirmación en chat privado vinculado. Se verificó su token con getMe: `@LiciLicitacionesBot`. La prueba conjunta local validó recepción, cola y reentrega sin enviar mensajes reales. Su configuración no prueba que esté ejecutándose. El CRM no inicia ese bot ni comparte su token. El alcance actual solicita contacto comercial; la conversación bidireccional desde una bandeja CRM, la asignación de asesores reales y las notificaciones a sus chats siguen pendientes. [Activación completa en el portal](../../portal/docs/ASESORIAS_CRM.md).

## Referencias técnicas

- [Pruebas con FastAPI](https://fastapi.tiangolo.com/tutorial/testing/).
- [RLS en Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Efectos de React y sincronización externa](https://react.dev/reference/react/useEffect).
