# Solicitudes de asesoría desde el portal y Telegram

## Alcance acordado el 26/10/2026

El CRM recibe únicamente solicitudes explícitas de asesoría o cotización. Desbloquear una licitación, consultar el bot o recibir una recomendación no crea una entrada comercial. La interfaz comercial se concentra en Negocios; se retira Prospectos del menú sin eliminar el historial existente.

## Contrato

Se reutiliza `POST /api/crm/events`, autenticado de servidor a servidor con `X-CRM-Ingest-Key`. Admite `origin=Lici` (portal) o `Telegram` y `kind=advice|quote`. Rechaza señales y registros sin intención explícita. Conserva el formato y la respuesta idempotente existentes.

El portal expone `POST /api/asesorias` con sesión, UUID estable `solicitudId` y `licitacionId`. Verifica que la cuenta haya desbloqueado esa licitación. Empresa, RUC y contacto se obtienen en el servidor. Telegram requiere chat privado y cuenta vinculada; `/asesor [servicio]` presenta una confirmación antes de enviar datos comerciales.

## Entrega y resultado

El emisor conserva un evento inmutable en una cola SQLite local antes de intentar entregarlo. API y bot comparten el archivo en una instalación. Reintenta errores de conexión, 409, 429 y 5xx con espera creciente; errores definitivos quedan visibles para operación. Conserva el mismo identificador y contenido entre reintentos. No guarda tokens ni conversaciones completas en la cola.

Al recibir la solicitud, el CRM crea o reutiliza empresa por RUC y contacto por correo. Abre o reutiliza un negocio abierto para esa empresa y servicio, en etapa Nuevo, con tarea inicial a 24 horas. Registra cada solicitud con su origen y contexto, incluso cuando varios canales desembocan en un mismo negocio. La primera procedencia del negocio se conserva; las siguientes aparecen en su ficha.

La confirmación indica si el CRM ya recibió la solicitud o si está guardada pendiente de entrega. No promete que un asesor esté conectado ni abre una conversación en vivo. El asesor utiliza el correo o el usuario público de Telegram disponibles en la ficha.

## Activación local y prueba real

Se configuró una clave de integración independiente y coincidente en los dos archivos `.env` locales, excluidos de Git. El portal apunta a la API local `http://127.0.0.1:8001`. En otros equipos se deben configurar los mismos valores de forma privada, según el servidor receptor elegido; localhost apunta siempre al equipo donde se ejecuta el emisor.

Ejecutar manualmente [008_origen_telegram.sql](../backend/migrations/008_origen_telegram.sql) en el SQL Editor del proyecto Supabase. No repetir la provisión del espacio. Luego reiniciar `npm start` del CRM y los procesos del portal. El bot se inicia desde la carpeta `backend` del portal con `.\.venv\Scripts\python.exe -m app.bot`; mantener una sola instancia por token.

El 26/10 se verificó getMe del bot `@LiciLicitacionesBot`, sin enviar mensajes a usuarios. La lectura remota del CRM mostró versión 2, revisión 1 y 540 productos ISO. La prueba con Telegram real queda pendiente del SQL y de la confirmación del usuario desde su cuenta vinculada. El código no inicia el bot automáticamente.

Recorrido: entrar al portal con una cuenta propia, vincular Telegram desde Mi perfil, enviar `/asesor` al bot y confirmar **Solicitar asesoría**. En CRM abrir Negocios y filtrar Telegram; revisar contacto y tarea inicial. La interfaz se actualiza cada 30 segundos y al recuperar foco. Para el otro recorrido, confirmar **Hablar con un asesor** en una licitación ya desbloqueada y revisar el contexto en la ficha. Si se solicita el mismo servicio para el mismo RUC, se conserva el negocio abierto y se agrega la nueva solicitud.

Configuración, arranque y recuperación de errores definitivos de la cola: [guía del portal](../../interfaz_licitigo/docs/ASESORIAS_CRM.md).

## Verificación requerida

- Sin clave de integración o sin cuenta vinculada: no se envían datos.
- Grupo de Telegram, licitación ajena o sin desbloquear: rechazo.
- Cancelar la confirmación: no crea solicitud.
- Entrega y reentrega: una única entrada y un negocio compatible.
- CRM apagado: cola persistente, confirmación de pendiente y recuperación tras reinicio.
- Solicitudes desde web y Telegram visibles en Negocios y su ficha.
- Aplicar manualmente `008_origen_telegram.sql` en Supabase antes de activar Telegram. No se ejecuta DDL remoto durante el desarrollo.

## Referencias

- [Telegram Bot API: botones y consultas de confirmación](https://core.telegram.org/bots/api#inlinekeyboardbutton).
- [python-telegram-bot: tareas periódicas](https://docs.python-telegram-bot.org/en/latest/telegram.ext.jobqueue.html).
