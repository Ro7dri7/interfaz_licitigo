# Estado de la primera entrega

Actualización 19/10/2026: marca visible **LiciHub** aplicada al CRM y al Portal Clientes React. Revisión de los dos videos, capturas, referencia CRM/Bandeja y documentación 360dialog/n8n completada; el nuevo alcance está en [LICIHUB_FLUJOS_Y_REQUISITOS.md](LICIHUB_FLUJOS_Y_REQUISITOS.md). Persistencia local sustituida por SQLite relacional y migraciones/adaptador PostgreSQL probados. El usuario ejecutará los archivos en Supabase; [guía de activación](SUPABASE_RELACIONAL.md). No se aplicó SQL remoto. La aplicación comercial sigue en modo local y las nuevas integraciones aún no están activadas.

16 de octubre de 2026. Desarrollo autorizado sobre el stack React vigente. Esta entrega permite evaluar el flujo comercial con persistencia local; no declara completado todo el plan ni habilitado un CRM productivo.

## Disponible y verificado localmente

| Módulo | Comportamiento implementado |
|---|---|
| Identidad y navegación | Estilos derivados de Lici React; barra lateral, escritorio/móvil, carga, error, vacío, formularios con teclado y Escape |
| Mi día | Solicitudes explícitas asociadas a negocios nuevos, negocios abiertos y su valor, tareas vencidas, total de ventas ganadas, señales por revisar |
| Prospectos | Alta manual multicanal; responsable e interés; vistas solicitudes/señales; conversión explícita por asesor |
| Empresas/contactos | Listados, búsqueda y negocios asociados; coincidencia de empresa por RUC y contacto por correo dentro de su empresa |
| Negocios | Tablero/lista, filtros de origen/responsable/servicio, ficha con propiedades, contexto ISO, actividades, contactos y propuestas |
| Seguimiento | Etapas persistentes; notas, llamadas/reuniones registradas; tareas con zona horaria, pendientes y completadas |
| Catálogo | Alta de servicio/precio PEN para administrador; listado |
| Cotizaciones | Una partida por versión, cantidad, descuento, impuesto configurable, redondeo en céntimos, vigencia y condiciones, vista imprimible/PDF del navegador |
| Cierre | Ganado con importe; perdido con motivo; reapertura y cambios de etapa trazables |
| Persistencia | Tablas SQLite con claves foráneas, transacciones, revisión contra sobrescrituras, reintentos idempotentes e importación única del JSON anterior sin modificarlo |
| Integraciones | Página de estado explícito; recepción de eventos Lici implementada en API pero deshabilitada sin clave |

Los indicadores abarcan todo el espacio cargado, sin período ni aislamiento por asesor. “Solicitudes por atender” cuenta entradas explícitas cuyo negocio sigue en Nuevo; puede haber más de una solicitud para un mismo negocio. “Ventas ganadas” suma el importe vigente de negocios Ganados, incluidos los impuestos de la propuesta. No representa facturación, cobranza ni el valor de las licitaciones. No se muestran métricas inventadas de conversión.

## Preparado, sin activar o verificar con servicios reales

| Integración | Disponible | Falta |
|---|---|---|
| Supabase actual (`jwxdwszinjdhzoierizm`) | Esquema privado de 13 tablas, índices y claves al portal; funciones transaccionales, actor por UUID, acceso por Supabase Auth y membresía CRM, roles admin/commercial, cookie HttpOnly/Secure | Usuario ejecuta 002/003, provisiona espacio/miembros y configura servidor; desplegar HTTPS, probar sesiones y concurrencia reales |
| Lici React | Receptor autenticado y contrato de solicitudes/señales, deduplicación de entrega | Emisor en `interfaz_licitigo`, outbox/reintentos durables, IDs reales, correspondencia de servicios, vínculo al análisis y validación de permisos |
| Telegram | Se ubicó el bot existente de Lici y se conservó su proyecto | Decidir eventos comerciales, enlazar usuarios autorizados, implementar entrega y verificar el bot; no se enviaron mensajes |
| WhatsApp/correo | Registro manual de origen y actividad | Integración de cuentas, bandeja, envíos y estados de entrega |

La API Supabase reconoce únicamente miembros activos del espacio. Un cliente de Lici no obtiene acceso por estar autenticado. Ambos roles comerciales ven el espacio completo; el administrador puede añadir productos y el asesor no. **Falta la política por equipo/propietario y su aplicación a todas las operaciones** antes de ampliar el piloto. El responsable es texto libre en esta entrega, no un usuario asignable validado.

## Funciones del plan todavía pendientes

- Edición y fusión de empresas/contactos, selector de registros existentes sin RUC, historial propio de contacto, cargos y enriquecimiento SUNAT/RNP/CIIU. La vinculación actual requiere RUC exacto; no fusiona por nombre o teléfono.
- Estados del prospecto para descartar/reciclar con motivo; reasignación del responsable, prioridad, SLA y reglas automáticas. Las señales se conservan como entradas independientes aunque compartan negocio.
- Actualización del análisis tardío, URL/documento fuente, fecha real del análisis y confirmación estructurada de certificaciones que posee/faltan. Hoy muestra lo capturado; no ejecuta análisis ISO.
- Catálogo editable, desactivación, proveedores/modalidades; cotización con varias partidas, membrete fiscal definitivo, aceptación, envío, estados y PDF generado por servidor. El borrador no cambia a “Cotización enviada” automáticamente. Esa etapa se registra manualmente cuando el asesor haya enviado por otro medio.
- Calendario mensual, adjuntos, recordatorios externos y automatizaciones. Las tareas pendientes de un negocio cerrado permanecen hasta que el asesor las complete.
- Informes por período, conversión, tiempos, atribución multicanal y rendimiento por asesor.
- Postventa, siguiente responsable tras ganar, certificados, renovaciones, cobros, comisiones y campañas.
- Migración de datos del CRM de referencia o HubSpot. Ningún dato comercial real fue importado.

## Límites técnicos que condicionan la salida a producción

El modelo actual guarda **filas por entidad**, con claves foráneas e índices; las propuestas, partidas, actividades, recibos e historial de etapas son inmutables. El adaptador Supabase aplica solo filas cambiadas junto con recibo e historial en una transacción; no guarda un documento JSONB por espacio. RLS bloquea acceso directo de roles cliente, mientras el backend privilegiado valida membresía y las escrituras SQL la comprueban otra vez. Se conserva la lectura completa del espacio y una revisión global: aún hay conflictos entre operaciones concurrentes aunque afecten negocios distintos. Antes de crecer faltan paginación, concurrencia por entidad, autorización por asesor y retención de recibos. No se ha probado carga ni alta disponibilidad.

La inspección remota confirmó el esquema compartido sin modificarlo: las tablas anteriores `public.crm_negocios` y `public.productos_iso` estaban vacías y se conservan. Las referencias a perfil/convocatoria/análisis están preparadas en PostgreSQL; todavía falta aceptarlas en el contrato de eventos y conectarlas desde el portal. La demo no sincroniza ni sube datos ficticios a Supabase.

También faltan: rate limiting del login y del receptor, límites de cuerpo en el proxy antes de bufferizar, monitorización/alertas, respaldo/restauración remotos probados, política de sesiones y refresco de token, MFA/recuperación de cuenta según el equipo, validación de CSP y revisión de dependencias Python en un entorno propio reproducible. La cookie actual vence como máximo en una hora y requiere volver a iniciar sesión. El endpoint de estado se refresca al cargar o ante conflicto; aún no hay sincronización en tiempo real entre asesores.

## Evidencia de validación

- TypeScript/Vite: build correcto; oxlint sin hallazgos, sin desactivar reglas.
- 29 pruebas Python: reglas/API, vínculos, versiones/precios, moneda/fechas, origen, tamaño, demo local, permisos con respuestas simuladas de Supabase Auth; SQLite con claves foráneas, rollback, guardado solo de cambios, reinicio e importación íntegra del JSON incluso con la configuración anterior; adaptador HTTP relacional y fallos de funciones ausentes.
- 10 pruebas PostgreSQL con PGlite: flujo completo, bloqueo de roles cliente, membresía/rol, idempotencia y conflictos, límites de espacio/empresa y rollback, propuestas inmutables, validación de enlaces al portal, restricciones de integración, plantilla de administrador y repetición de migraciones. Usan un esquema mínimo de portal/Auth, no una instancia Supabase remota.
- 4 pruebas Chrome: señal→solicitud multicanal→cotización→actividad→tarea→ganado con recarga; conversión de señal y pérdida; móvil/teclado/foco; vacío/error/reintento.
- Revisión visual: Mi día, tablero, ficha a 1440 px, ficha a 375 px sin desborde horizontal y propuesta en modo impresión. No equivale a auditoría WCAG completa ni a validación en Safari/Firefox.
- Hallazgos corregidos: señal que llegaba después de una solicitud quedaba sin vincular; reconversión de prospecto cerrado podía generar negocio huérfano; foco del modal y propuesta oculta al imprimir; contraseña con espacios debía preservarse; fechas de tarea se normalizan a UTC.

## Siguiente entrega sugerida

Activar un espacio Supabase **de prueba**, validar el acceso de administrador/asesor/cliente y conectar el emisor de solicitudes y desbloqueos de Lici con reintentos. Mantener como criterio de aceptación: un desbloqueo conserva su contexto sin abrir una venta; la solicitud posterior abre o vincula exactamente un negocio compatible y muestra ambos orígenes.
