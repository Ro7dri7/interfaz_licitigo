# Integraciones y activación

## Supabase: preparación disponible

El proyecto vigente de Lici React es `jwxdwszinjdhzoierizm`. La migración `backend/migrations/001_crm.sql` crea únicamente `crm_workspaces` y `crm_members`; no modifica tablas existentes de Lici ni crea usuarios. **No fue ejecutada durante esta entrega.** Verificar el proyecto de destino y ensayar en un entorno de prueba antes de datos reales.

1. Aplicar la migración en el proyecto elegido.
2. Crear un espacio vacío: `insert into public.crm_workspaces (name) values ('Equipo comercial') returning id;`.
3. Registrar miembros con IDs reales de Supabase Auth. Ejemplo para sustituir los marcadores:

```sql
insert into public.crm_members (workspace_id, user_id, display_name, role)
values ('UUID_DEL_ESPACIO', 'UUID_DEL_USUARIO_AUTH', 'Nombre del asesor', 'commercial');
```

4. Configurar en el servidor `CRM_MODE=supabase`, `CRM_ORIGIN=https://dominio-del-crm`, `CRM_SUPABASE_URL`, `CRM_SUPABASE_SECRET_KEY` (clave de servidor compatible con service_role) y `CRM_WORKSPACE_ID`.
5. Servir frontend y `/api/crm` en el mismo origen HTTPS. La clave de servicio nunca se entrega a React. RLS está habilitado y anon/authenticated no tienen acceso directo a estas dos tablas; el backend valida JWT y membresía activa antes de cada lectura o comando.
6. Verificar con cuentas reales: sin sesión → 401; cliente ajeno al CRM → 403; asesor → espacio completo pero no alta de productos; administrador → catálogo. Probar expiración, revocación de membresía, escrituras simultáneas, respaldo y restauración. Estas verificaciones remotas siguen pendientes.

El adaptador no carga semillas ficticias en Supabase. La creación de espacio vacío y miembros es separada. Ante un despliegue fallido, detener el servicio CRM y revertir su configuración; conservar tablas y respaldo para evitar pérdida. No borrar tablas compartidas ni usuarios de Lici como rollback.

## Contrato inicial Lici → CRM

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
    "kind": "signal",
    "service": "ISO 9001",
    "owner": "Sin asignar",
    "evidence": "required",
    "tender": "LP-EJEMPLO-001",
    "deadline": "2026-12-31",
    "notes": "Requisito detectado en una licitación desbloqueada."
  }
}
```

`kind`: `signal` (desbloqueo/contexto), `advice` (asesoría), `quote` (cotización), `manual` (registro sin intención confirmada). `evidence`: `required`, `recommended`, `pending`, `none`. El canal de integración solo acepta `origin=Lici`. Empresa y servicio son obligatorios; RUC/contacto pueden faltar. El RUC suministrado tiene 11 dígitos; el formato no acredita validez ante SUNAT.

Reglas de vinculación:

- Empresa por RUC exacto no vacío. Contacto por correo dentro de su empresa. Sin RUC no se asume identidad por razón social.
- Negocio abierto compatible = misma empresa y mismo texto de servicio, sin distinguir mayúsculas. Los alias de servicios aún requieren un catálogo de correspondencias en el emisor.
- Solicitud explícita crea/vincula negocio y tarea inicial de atención a 24 horas si abre negocio. Una señal aislada no crea negocio.
- Una señal previa se vincula cuando llega la solicitud; una señal posterior se añade al negocio abierto compatible. Conserva requisito/recomendación y tipo original.
- Un negocio ganado/perdido no se reutiliza automáticamente ante una nueva solicitud; se abre otro. No puede reconvertirse un prospecto ya asociado: se abre su ficha o se registra una nueva entrada.

Respuesta: `{"accepted":true,"duplicate":false}` o `duplicate:true` para repetición idéntica. Repetir **el mismo requestId y payload** permite reintentar tras timeout sin duplicar. Cambiar el payload con el mismo ID devuelve 422; la actualización tardía de análisis necesita un contrato adicional aún pendiente. No reenviar como si fuera el mismo evento modificado.

Errores: 401 clave inválida; 422 entrada inválida/conflicto de ID; 409 conflicto de revisión tras tres intentos internos; 413 cuerpo >64 KiB; 503 deshabilitado/almacenamiento no disponible. El emisor debe guardar los eventos en outbox, reintentar timeouts/409/503 con backoff y alertar sobre errores definitivos. **Ese emisor no está implementado.**

## API de la interfaz

`GET /api/crm/session`, `POST /api/crm/login`, `POST /api/crm/logout`, `GET /api/crm/state` y `POST /api/crm/commands`. Documentación de transporte en `/docs` de FastAPI. Los modelos específicos de cada operación están en `backend/domain.py`.

Comandos: `intake`, `convert`, `stage`, `activity`, `task`, `complete_task`, `product`, `quote`. El cuerpo contiene `revision`, `requestId`, `operation`, `payload`. El servidor valida las operaciones y aplica el cambio atómicamente; 409 obliga a refrescar y reintentar. La interfaz conserva un identificador para reintentar el formulario. Los recibos de idempotencia no se exponen al cliente.

Las escrituras de interfaz requieren la cabecera Origin exacta. El receptor de eventos usa su propia credencial. Los importes de respuesta se expresan en **céntimos PEN**; al crear producto, `price` se introduce en soles. Las tareas requieren datetime con zona y se almacenan en UTC; la interfaz muestra Perú.

## Telegram

El bot de `../interfaz_licitigo/backend/app/bot.py` pertenece al flujo existente de Lici. Su presencia y configuración local no prueban que esté ejecutándose. El CRM no inicia ese bot, no comparte su token y no envía mensajes. Para integrarlo faltan mapeo asesor/usuario/chat, reglas de notificación, cola idempotente, límites de envío y prueba con destinatario autorizado.

## Referencias técnicas

- [Pruebas con FastAPI](https://fastapi.tiangolo.com/tutorial/testing/).
- [RLS en Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Efectos de React y sincronización externa](https://react.dev/reference/react/useEffect).
