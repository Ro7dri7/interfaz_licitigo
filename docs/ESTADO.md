# Estado de la primera entrega

Actualización 26/10/2026: se consultó y descargó `origin/main`; no había nuevos cambios publicados respecto de 709b954. Se implementó la captación por solicitud explícita desde una licitación desbloqueada y desde Telegram con confirmación, recepción idempotente y cola persistente en el portal. Prospectos se retira del menú; Negocios concentra la atención. Se conserva el historial anterior. Las pruebas incluyen navegador, grupos/no vinculados, cancelación, reentrega y recuperación de una caída del CRM. La lectura real de Supabase confirmó versión 2, revisión 1 y 540 productos, sin empresas ni negocios. Por tanto, las notas anteriores sobre 006/007 pendientes quedaron superadas. No se aplicó SQL remoto. Falta ejecutar **008_origen_telegram.sql**, reiniciar los procesos y confirmar una solicitud desde una cuenta propia en el bot real. [Flujo y criterios](ASESORIA_PORTAL_TELEGRAM.md).

Actualización 20/10/2026: SQL aplicado por el usuario; configuración local Supabase guardada fuera de Git. Las funciones y el espacio real son accesibles, con revisión 0 y colecciones vacías. Se habilitó HTTPS local en `https://127.0.0.1:5174` mediante `npm run dev:https` y se comprobó la pantalla de ingreso; sin sesión, la API responde 401. El servidor registró inicio de sesión y lecturas autenticadas correctos; faltan primer guardado comercial, validación remota de los distintos roles y despliegue público. No se importó la demo ni se escribieron datos comerciales remotos. La nota del 19/10 describe el estado anterior.

Actualización 19/10/2026: marca visible **LiciHub** aplicada al CRM y al Portal Clientes React. Revisión de los dos videos, capturas, referencia CRM/Bandeja y documentación 360dialog/n8n completada; el nuevo alcance está en [LICIHUB_FLUJOS_Y_REQUISITOS.md](LICIHUB_FLUJOS_Y_REQUISITOS.md). Persistencia local sustituida por SQLite relacional y migraciones/adaptador PostgreSQL probados. El usuario ejecutará los archivos en Supabase; [guía de activación](SUPABASE_RELACIONAL.md). No se aplicó SQL remoto. La aplicación comercial sigue en modo local y las nuevas integraciones aún no están activadas.

16 de octubre de 2026. Desarrollo autorizado sobre el stack React vigente. Esta entrega permite evaluar el flujo comercial con persistencia local; no declara completado todo el plan ni habilitado un CRM productivo.

Ampliación comercial 20/10: cotizaciones múltiples y paquetes, estados auditados y documento INTERCERT implementados; precios del Excel con IGV incluido por decisión del usuario. Catálogo seleccionado: 540 referencias ISO, incluidas 165 de paquetes; Lucía Mendoza y Diego Salazar son responsables ficticios seleccionables. **Faltan ejecutar 006/007 en Supabase**; no se cargó el catálogo remoto ni se aplicó esa evolución desde aquí. [Activación y recorrido de prueba](COTIZACIONES.md).

Actualización 21/10/2026: navegación unificada en **Directorio**, con Empresas como vista inicial y ficha por organización. Los datos y permisos se conservan; no requiere otra migración SQL. [Detalle y límites](DIRECTORIO.md).

## Disponible y verificado localmente

| Módulo | Comportamiento implementado |
|---|---|
| Identidad y navegación | Estilos derivados de Lici React; barra lateral, escritorio/móvil, carga, error, vacío, formularios con teclado y Escape |
| Mi día | Solicitudes explícitas asociadas a negocios nuevos, negocios abiertos y su valor, tareas vencidas y total de ventas ganadas |
| Captación comercial | Solicitudes de asesoría/cotización directamente a Negocios; sin recepción de señales automáticas; historial anterior conservado |
| Directorio | Empresas y Contactos en una entrada con pestañas, búsqueda, filtros y ficha de empresa; consulta de personas, negocios y versiones de cotización; rutas antiguas compatibles |
| Negocios | Tablero/lista, filtros de origen/responsable/servicio, ficha con propiedades, contexto ISO, actividades, contactos y propuestas |
| Seguimiento | Etapas persistentes; notas, llamadas/reuniones registradas; tareas con zona horaria, pendientes y completadas |
| Catálogo | Formulario Nuevo producto con precio PEN/IGV incluido y estado; rechazo de cursos; importación ISO idempotente (375 variantes individuales y 165 paquetes), búsqueda y filtros por tipo/paquete |
| Cotizaciones | Hasta 50 partidas/paquetes por versión, descuento e IGV incluido configurables, instantánea de precios/cliente/emisor, envío/aceptación/rechazo auditados y documento INTERCERT imprimible/PDF |
| Cierre | Ganado con importe; perdido con motivo; reapertura y cambios de etapa trazables |
| Persistencia | Tablas SQLite con claves foráneas, transacciones, revisión contra sobrescrituras, reintentos idempotentes e importación única del JSON anterior sin modificarlo |
| Integraciones | Página de estado explícito; recepción de eventos Lici implementada en API pero deshabilitada sin clave |

Los indicadores abarcan todo el espacio cargado, sin período ni aislamiento por asesor. “Solicitudes por atender” cuenta entradas explícitas cuyo negocio sigue en Nuevo; puede haber más de una solicitud para un mismo negocio. “Ventas ganadas” suma el importe vigente de negocios Ganados, incluidos los impuestos de la propuesta. No representa facturación, cobranza ni el valor de las licitaciones. No se muestran métricas inventadas de conversión.

## Preparado, sin activar o verificar con servicios reales

| Integración | Disponible | Falta |
|---|---|---|
| Supabase actual (`jwxdwszinjdhzoierizm`) | SQL aplicado por el usuario, espacio configurado y lectura real vacía verificada; HTTPS local y pantalla de acceso; esquema privado, funciones transaccionales, roles y cookie segura preparados | Probar inicio de sesión, membresía, primer guardado y concurrencia con cuentas reales; desplegar HTTPS público |
| Lici React | Botón con confirmación, verificación del desbloqueo por cuenta, emisor y cola persistente, reintentos y prueba conjunta local | Prueba con cuenta propia y licitación real; ampliar el contexto estructurado del análisis |
| Telegram | `/asesor`, confirmación privada, cuenta vinculada, contacto y procedencia; token verificado por getMe, prueba conjunta local | Ejecutar SQL 008, reiniciar bot/API y probar una confirmación real; bandeja bidireccional posterior |
| WhatsApp/correo | Registro manual de origen y actividad | Integración de cuentas, bandeja, envíos y estados de entrega |

La API Supabase reconoce únicamente miembros activos del espacio. Un cliente de Lici no obtiene acceso por estar autenticado. Ambos roles comerciales ven el espacio completo; el administrador puede añadir productos y el asesor no. **Falta la política por equipo/propietario y su aplicación a todas las operaciones** antes de ampliar el piloto. El responsable sigue guardado como texto, con dos nombres ficticios seleccionables; no es un usuario asignable validado.

## Funciones del plan todavía pendientes

- Edición y fusión de empresas/contactos, selector de registros existentes sin RUC, historial propio de contacto, cargos y enriquecimiento SUNAT/RNP/CIIU. La vinculación actual requiere RUC exacto; no fusiona por nombre o teléfono.
- Reasignación a asesores reales, prioridad, SLA y reglas automáticas. El historial previo se conserva sin mantener un apartado Prospectos.
- Actualización del análisis tardío, URL/documento fuente, fecha real del análisis y confirmación estructurada de certificaciones que posee/faltan. Hoy muestra lo capturado; no ejecuta análisis ISO.
- Catálogo editable, desactivación, proveedores; envío real por canales externos, aceptación por enlace/firma y PDF generado por servidor. El registro manual de un envío externo ya actualiza el negocio temprano a Cotización enviada; un borrador por sí solo no lo hace.
- Calendario mensual, adjuntos, recordatorios externos y automatizaciones. Las tareas pendientes de un negocio cerrado permanecen hasta que el asesor las complete.
- Informes por período, conversión, tiempos, atribución multicanal y rendimiento por asesor.
- Postventa, siguiente responsable tras ganar, certificados, renovaciones, cobros, comisiones y campañas.
- Migración de datos del CRM de referencia o HubSpot. El catálogo ISO está preparado para importación; no se importaron empresas, contactos ni negocios reales.

## Límites técnicos que condicionan la salida a producción

Los scripts vigentes y el adaptador Supabase usan identificadores en español. La transición opcional 005, con API detenida, conserva los datos de una instalación anterior en inglés; también se verificó su reversión. La demo SQLite conserva sus nombres internos anteriores por compatibilidad. Orden condicional y configuración en [SUPABASE_RELACIONAL.md](SUPABASE_RELACIONAL.md). Aplicar SQL por sí solo no cambia la demo a modo Supabase ni activa el emisor de leads del portal.

El modelo actual guarda **filas por entidad**, con claves foráneas e índices; las propuestas, partidas, actividades, recibos e historial de etapas son inmutables. El adaptador Supabase aplica solo filas cambiadas junto con recibo e historial en una transacción; no guarda un documento JSONB por espacio. RLS bloquea acceso directo de roles cliente, mientras el backend privilegiado valida membresía y las escrituras SQL la comprueban otra vez. Se conserva la lectura completa del espacio y una revisión global: aún hay conflictos entre operaciones concurrentes aunque afecten negocios distintos. Antes de crecer faltan paginación, concurrencia por entidad, autorización por asesor y retención de recibos. No se ha probado carga ni alta disponibilidad.

La inspección remota confirmó el esquema compartido sin modificarlo: las tablas anteriores `public.crm_negocios` y `public.productos_iso` estaban vacías y se conservan. Las referencias a perfil/convocatoria/análisis están preparadas en PostgreSQL; todavía falta aceptarlas en el contrato de eventos y conectarlas desde el portal. La demo no sincroniza ni sube datos ficticios a Supabase.

También faltan: rate limiting del login y del receptor, límites de cuerpo en el proxy antes de bufferizar, monitorización/alertas, respaldo/restauración remotos probados, política de sesiones y refresco de token, MFA/recuperación de cuenta según el equipo, validación de CSP y revisión de dependencias Python en un entorno propio reproducible. La cookie actual vence como máximo en una hora y requiere volver a iniciar sesión. El estado se refresca cada 30 segundos mientras la interfaz está visible y al recuperar foco; aún no hay sincronización por eventos en tiempo real entre asesores.

## Evidencia de validación

- TypeScript/Vite: build correcto; oxlint sin hallazgos, sin desactivar reglas.
- 49 pruebas Python del CRM y 13 del portal: reglas/API, permisos, origen, idempotencia, almacenamiento y su evolución, confirmación/cancelación del bot, rechazo de grupos y chats no vinculados, cola persistente y recuperación. Las identidades externas se simulan; no se crean cuentas ni se envían mensajes a clientes.
- 16 pruebas PostgreSQL con PGlite: modelo, permisos, historial, catálogos, migraciones y nuevo origen Telegram con actualización repetible de instalaciones españolas o traducidas. Usan un esquema mínimo de portal/Auth, no una instancia Supabase remota.
- 9 pruebas Chrome del CRM: solicitud explícita con contexto, propuesta, actividad, tarea, cierre, Directorio, móvil/teclado, recuperación y entrada Telegram sin duplicado. Se comprobó adicionalmente el botón del portal en escritorio/móvil, cancelación y reintento con UUID estable.
- Prueba conjunta `interfaz_licitigo/scripts/probar_integracion_crm.py`: confirmación del bot, CRM apagado, cola persistente, entrega recuperada y petición web vinculadas al mismo negocio. Auditoría npm: cero vulnerabilidades en ambos proyectos tras actualizar dependencias del portal.
- Revisión visual: Mi día, tablero, ficha a 1440 px, ficha a 375 px sin desborde horizontal y propuesta en modo impresión. Se revisó además el documento INTERCERT A4 de dos partidas con IGV incluido y aceptación en una página. No equivale a auditoría WCAG completa ni a validación en Safari/Firefox.
- Hallazgos corregidos: señal que llegaba después de una solicitud quedaba sin vincular; reconversión de prospecto cerrado podía generar negocio huérfano; foco del modal y propuesta oculta al imprimir; contraseña con espacios debía preservarse; fechas de tarea se normalizan a UTC.

## Siguiente entrega sugerida

Aplicar SQL 008 y confirmar el recorrido real desde una cuenta propia del portal y su Telegram vinculado. Validar roles comerciales con cuentas distintas y resolver la asignación a asesores reales antes de diseñar la bandeja de conversación bidireccional.
