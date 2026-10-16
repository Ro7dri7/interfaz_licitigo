# Estado de la primera entrega

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
| Persistencia | JSON local con reemplazo atómico, revisión contra sobrescrituras y reintentos idempotentes |
| Integraciones | Página de estado explícito; recepción de eventos Lici implementada en API pero deshabilitada sin clave |

Los indicadores abarcan todo el espacio cargado, sin período ni aislamiento por asesor. “Solicitudes por atender” cuenta entradas explícitas cuyo negocio sigue en Nuevo; puede haber más de una solicitud para un mismo negocio. “Ventas ganadas” suma el importe vigente de negocios Ganados, incluidos los impuestos de la propuesta. No representa facturación, cobranza ni el valor de las licitaciones. No se muestran métricas inventadas de conversión.

## Preparado, sin activar o verificar con servicios reales

| Integración | Disponible | Falta |
|---|---|---|
| Supabase actual (`jwxdwszinjdhzoierizm`) | Adaptador, migración aislada, acceso por Supabase Auth y membresía CRM, roles admin/commercial, cookie HttpOnly/Secure | Aplicar SQL en entorno de prueba, crear espacio/miembros, configurar secreto en servidor, desplegar HTTPS, probar sesiones y concurrencia reales |
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

La persistencia Supabase propuesta para este piloto es **un documento JSONB por espacio**, con comparación de revisión. Permite probar las mismas reglas, pero no reemplaza un modelo relacional comercial: lee el espacio completo y retiene recibos de idempotencia sin purga. Antes de crecer se necesitan tablas por entidad/evento, índices, paginación, autorización por fila, retención de eventos y auditoría persistente del actor por ID. No se ha probado carga ni alta disponibilidad.

También faltan: rate limiting del login y del receptor, límites de cuerpo en el proxy antes de bufferizar, monitorización/alertas, respaldo/restauración remotos probados, política de sesiones y refresco de token, MFA/recuperación de cuenta según el equipo, validación de CSP y revisión de dependencias Python en un entorno propio reproducible. La cookie actual vence como máximo en una hora y requiere volver a iniciar sesión. El endpoint de estado se refresca al cargar o ante conflicto; aún no hay sincronización en tiempo real entre asesores.

## Evidencia de validación

- TypeScript/Vite: build correcto; oxlint sin hallazgos, sin desactivar reglas.
- 20 pruebas Python: reglas, vínculos, conservación de versiones/precios, moneda, fechas, no mutación en errores, persistencia tras recrear repositorio, conflictos, idempotencia, origen, límite de tamaño, bloqueo de acceso remoto demo, eventos autenticados y permisos con respuestas simuladas de Supabase Auth.
- 4 pruebas Chrome: señal→solicitud multicanal→cotización→actividad→tarea→ganado con recarga; conversión de señal y pérdida; móvil/teclado/foco; vacío/error/reintento.
- Revisión visual: Mi día, tablero, ficha a 1440 px, ficha a 375 px sin desborde horizontal y propuesta en modo impresión. No equivale a auditoría WCAG completa ni a validación en Safari/Firefox.
- Hallazgos corregidos: señal que llegaba después de una solicitud quedaba sin vincular; reconversión de prospecto cerrado podía generar negocio huérfano; foco del modal y propuesta oculta al imprimir; contraseña con espacios debía preservarse; fechas de tarea se normalizan a UTC.

## Siguiente entrega sugerida

Activar un espacio Supabase **de prueba**, validar el acceso de administrador/asesor/cliente y conectar el emisor de solicitudes y desbloqueos de Lici con reintentos. Mantener como criterio de aceptación: un desbloqueo conserva su contexto sin abrir una venta; la solicitud posterior abre o vincula exactamente un negocio compatible y muestra ambos orígenes.
