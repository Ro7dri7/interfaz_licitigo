# Lici CRM — propuesta de producto y plan inicial

Fecha del plan: 15 de octubre de 2026. Actualización: 16 de octubre de 2026. El usuario autorizó comenzar el desarrollo con lo disponible y documentar lo pendiente. Se entregó un primer flujo local sobre React/FastAPI; este plan conserva el alcance de producto, que excede lo implementado. Estado comprobado en [../docs/ESTADO.md](../docs/ESTADO.md) y tareas en [todo.md](todo.md).

## Objetivo confirmado

Dar al equipo comercial un CRM complementario a Lici para vender certificaciones y servicios. El cliente suele llegar después de interesarse por una licitación en Lici, pero también puede entrar por WhatsApp, campañas, referidos, partners o registro manual. La licitación es contexto comercial cuando existe; no debe ser obligatoria para crear un prospecto o negocio.

## Evidencia revisada

- CRM autenticado de referencia: https://buhbuhbuh.com/. Se revisaron Inicio, Negocios, vista previa y ficha de un negocio, Leads, pantallas de Empresas y Contactos, Cotizaciones, Catálogo, Dashboard, Calendario y explicación de Automatizaciones CRM. Fue una revisión de navegación, no una prueba integral de funcionalidades. No se crearon ni editaron registros comerciales ni se enviaron comunicaciones.
- El CRM usa navegación lateral, vistas lista/tablero, filtros por responsable, múltiples pipelines, tiempos por etapa, actividades y asociaciones entre negocios, empresas, contactos y productos. La ficha de negocio muestra propiedades a la izquierda, actividad en el centro y asociaciones a la derecha.
- Catálogo contempla productos, proveedores, modalidades y precios; Cotizaciones muestra estado, monto, propietario y vencimiento. El Dashboard ofrece filtros por pipeline, comercial y período.
- Las 16 imágenes en `Diseño/`: cuatro propuestas con marca Lici y doce capturas de HubSpot. Cubren contactos, empresas, pipeline de ventas, ficha de negocio, elementos de pedido y formularios laterales.
- Base vigente, corregida tras la indicación del usuario: `../interfaz_licitigo/`. Su commit `84ec966` del 30 de septiembre de 2026 registra «Lici completo en React: cuentas, onboarding, descubrimiento, desbloqueos y perfil». `../lici-web/` es la versión anterior en Angular y no será la base del CRM.
- Se verificaron `../interfaz_licitigo/package.json`, README, `src/App.tsx`, `src/index.css`, componentes, modelos, configuración del backend y código del bot. Stack actual: React 19, TypeScript, Vite y Tailwind CSS 4; backend FastAPI; Supabase/PostgreSQL y Supabase Auth.
- La configuración local de React apunta al proyecto Supabase `jwxdwszinjdhzoierizm`, diferente del de Angular (`tkcplmvyjopmfclruajg`). Es un cambio de proyecto de base de datos dentro de Supabase. Esta comprobación fue local; no valida conexión, tablas ni despliegue remoto. No se copiaron credenciales al plan.
- Telegram está incorporado en `backend/app/bot.py` y `suscripciones.py`, los endpoints `/api/alertas/telegram` y la interfaz `src/components/EnlaceTelegram.tsx`. La configuración local contiene valores para token de Telegram y webhook n8n; esto no confirma que el bot esté ejecutándose o que los valores sean válidos. Parte del README todavía lista su configuración como pendiente.
- Según documentación y código locales de React, Lici ya contempla perfiles por RUC, información SUNAT/RNP, CIIU, licitaciones, desbloqueos y análisis ISO. No se verificó en esta revisión el despliegue de esas integraciones. `src/pages/EquipoPage.tsx` también usa `MOCK_PIPELINE` y cambios en memoria; no constituye un CRM persistente.

## Dirección visual propuesta

Lici y Lici CRM compartirán logo, paleta, tipografía, botones, inputs, tarjetas, etiquetas, iconos y estados. La fuente de verdad será el proyecto React: `interfaz_licitigo/src/index.css`, utilidades de `src/lib/ui.ts` y componentes de `src/components/`:

- Azul principal `#2f5bea`; fondo `#f6f7fb`; superficies blancas; texto `#0f172a`; bordes `#e4e7ee`.
- Inter para interfaz y datos; Source Serif 4 en títulos donde corresponda al estilo actual de Lici; JetBrains Mono para identificadores.
- Radios de 8/12/16 px, sombras suaves y estados verde/ámbar/rojo acompañados de texto.
- Cabecera común con identidad Lici, búsqueda y usuario. El CRM incorporará navegación lateral para sus módulos; el acceso entre aplicaciones respetará los permisos del usuario.
- Tableros y listas compactos pero legibles. Formularios de alta en panel lateral. Ficha completa de tres columnas en escritorio y secciones apiladas/pestañas en pantallas pequeñas.
- Reservar el azul oscuro para bloques de inteligencia o navegación. Evitar marcas de agua detrás de datos y barras decorativas permanentes.
- Las capturas son referencias, no evidencia de una integración: indicadores de sincronización, asistencia contextual o estado RNP aparecerán únicamente cuando dispongan de datos verificables. No copiar afirmaciones legales o de disponibilidad incluidas en los mockups.

## Mapa inicial de apartados

| Apartado | Trabajo que resuelve | Prioridad propuesta |
|---|---|---|
| Mi día | Pendientes, leads nuevos, seguimientos vencidos, cotizaciones por vencer y negocios sin próxima acción | Primera versión |
| Prospectos | Entrada multicanal, origen/campaña, asignación, calificación y conversión | Primera versión |
| Empresas | Ficha por RUC, datos de Lici, sector, contactos, negocios e historial | Primera versión |
| Contactos | Personas, cargo, teléfono, correo, empresa y relación comercial | Primera versión |
| Negocios | Tablero/lista, servicio de interés, monto, etapa, responsable, prioridad y próxima acción | Primera versión |
| Actividades y agenda | Notas, registro de llamadas, tareas, reuniones y recordatorios | Primera versión |
| Catálogo y cotizaciones | Servicios/paquetes, partidas, cantidades, descuentos, impuestos configurados, vigencia y versiones | Primera versión |
| Informes | Conversión por origen, ventas, cotizaciones, tiempos de atención y rendimiento del equipo | Básico al inicio |
| Configuración | Usuarios, roles, etapas, orígenes, motivos de pérdida y catálogo | Básico al inicio |
| Bandeja | Conversaciones WhatsApp/correo vinculadas al contacto y negocio | Segunda fase, según prioridad comercial |
| Postventa y renovaciones | Entrega, certificados, fechas relevantes y nueva oportunidad de renovación | Segunda fase |
| Automatizaciones | Asignación, tareas, recordatorios y reglas de seguimiento | Reglas simples primero |
| Comisiones y campañas | Reglas de comisión, campañas/difusiones y atribución avanzada | Fase posterior |

La captura manual del origen WhatsApp puede existir desde el principio; la bandeja integrada y el envío de mensajes requieren una integración de canal separada.

## Flujo principal propuesto

1. **Captación:** llega un prospecto desde Lici u otro canal. Se registra el origen original y el evento de entrada; los contactos posteriores conservan su propio canal.
2. **Identificación:** se vinculan o crean empresa y contacto. La empresa puede existir antes de contar con RUC; los datos pendientes se completan sin impedir el seguimiento inicial.
3. **Calificación:** el asesor verifica necesidad, servicio, plazo y contacto. El interés comercial no se deduce automáticamente de cada visita a una licitación.
4. **Negocio:** se abre una oportunidad concreta para un servicio/paquete, con responsable y próxima acción. Una empresa puede tener varios negocios.
5. **Cotización:** se preparan partidas del catálogo, condiciones y vigencia. Cada versión conserva sus precios aunque el catálogo cambie después.
6. **Seguimiento y cierre:** se registra aceptación o motivo de pérdida. Ganar una venta, cobrarla y entregar la certificación son estados separados.
7. **Postventa:** se gestiona entrega/renovación y se conserva el historial de la venta original.

Pipeline inicial a discutir: **Nuevo → Contactado → Necesidad validada → Cotización enviada → Seguimiento/negociación → Ganado / Perdido**. “En pausa” puede manejarse con fecha de reactivación. Las etapas y tiempos objetivo serán configurables; no se copiarán sin validar todos los estados del CRM de referencia.

El ciclo del prospecto (nuevo, en contacto, calificado, descartado/reciclar) es distinto de las etapas del negocio. Los rótulos MQL/SQL de las capturas solo se usarán si el equipo define sus criterios.

## Integración que aporta Lici

En la ficha comercial, incorporar un bloque “Contexto Lici” con:

- Empresa/RUC y enlace al perfil de origen.
- Licitación o licitaciones relacionadas: código, entidad, título, plazo y enlace al detalle.
- Análisis disponible: requisitos ISO detectados, brechas, recomendación y fecha de análisis.
- Servicio de interés y solicitud realizada por el cliente, con fecha y procedencia.
- Datos de referencia de SUNAT/RNP con fuente y fecha de actualización.

Las ISO exigidas por unas bases, las recomendadas por el análisis y las que posee la empresa serán conceptos separados. Un requisito detectado no demuestra por sí solo que a la empresa le falte esa certificación. El asesor podrá confirmar o corregir la necesidad sin alterar el análisis original.

**Preferencia expresada por el usuario:** por ahora, abrir el negocio al solicitar asesoría o cotización. El usuario también quiere distinguir esas solicitudes de los desbloqueos con requisitos o recomendaciones ISO. Se propone el siguiente funcionamiento combinado para concretar esa preferencia.

### Solicitudes comerciales y señales de interés

| Evento | Registro y vista del CRM | Efecto comercial |
|---|---|---|
| Desbloqueo de licitación con análisis pendiente | Actividad en el prospecto, análisis pendiente | No abrir negocio ni afirmar necesidad ISO |
| Análisis detecta requisito ISO en las bases | Señal «Requisito ISO detectado», con licitación, norma y fuente | Aparecer en vista de prospectos «Señales Lici», para revisión |
| Análisis recomienda una ISO | Señal «ISO recomendada por análisis», separada de requisitos | Aparecer como recomendación, sin presentarla como obligación o carencia confirmada |
| Cliente solicita asesoría | Solicitud «Asesoría solicitada», vinculada a empresa/contacto/contexto | Crear o vincular negocio; asignar primera atención |
| Cliente solicita cotización | Solicitud «Cotización solicitada», conservando servicio y contexto | Crear o vincular negocio; priorizar preparación de propuesta |

«Señales Lici» será una vista dentro de Prospectos. «Solicitudes por atender» será una vista operativa que reúne solicitudes explícitas con su negocio asociado. Son filtros sobre registros relacionados, no bases de clientes independientes.

La ficha mostrará por separado origen de captación, tipo de solicitud, señales detectadas y etapa comercial. «Cotización solicitada» no significa «Cotización enviada». Un prospecto puede tener varios desbloqueos y varias señales; estas permanecen en el historial al convertirse en negocio.

Al recibir una solicitud, buscar negocio abierto de la misma empresa/contacto y necesidad comercial: vincular si corresponde; crear otro cuando sea una necesidad distinta. Un nuevo desbloqueo nunca creará otra empresa ni otro negocio por sí solo. Los reintentos de un evento no duplicarán solicitudes, tareas o negocios. Si el análisis llega después del desbloqueo, enriquecerá la señal existente.

Atender primero solicitudes explícitas y seguimientos comprometidos; revisar después señales por relevancia y plazo. La presencia de ISO en un análisis no confirma que la empresa carezca de ella ni autoriza un envío automático. El asesor podrá convertir una señal en negocio cuando confirme interés comercial, conservando que su origen fue prospección del asesor y no una solicitud del cliente.

Ejemplo: una empresa desbloquea tres licitaciones; una exige ISO 9001 y otra recibe recomendación ISO 14001. Su ficha reúne ambas señales y los tres eventos. Cuando pide cotización ISO 9001, se crea/vincula un negocio con esa solicitud; la recomendación ISO 14001 conserva su naturaleza y no se convierte automáticamente en otra venta.

## Reglas de información y acceso

- Empresa, persona, prospecto y negocio tendrán identificadores propios y asociaciones explícitas. RUC identifica a la empresa cuando esté disponible; un teléfono compartido no justifica fusionar registros automáticamente.
- Mantener origen original, campaña/referido/partner cuando corresponda y origen de cada oportunidad. Conservar vínculos a Lici sin sobrescribir datos comerciales corregidos por el equipo.
- No equiparar el valor de la licitación con el ingreso comercial: el monto del negocio es el de la certificación/servicio cotizado.
- Toda oportunidad abierta tendrá responsable y próxima acción, o una razón explícita para quedar en espera.
- Registrar cambios de etapa, responsable, cotización y cierre con autor y fecha.
- Perfil inicial de permisos propuesto: asesor (cartera asignada), supervisor (equipo) y administrador (configuración). Validar si hay varias organizaciones comerciales; los clientes de Lici no tendrán acceso implícito a datos internos del CRM.
- La integración Lici → CRM admitirá reintentos sin duplicados, estados de error visibles y trazabilidad. No conectará el navegador directamente con claves privilegiadas.
- Mantener contratos/documentos, cobros y venta como objetos/estados distintos. Facturación electrónica y firma electrónica no se presuponen incluidas.

## Implementación por etapas

1. **Definición y prototipo:** acordar módulos, etapas, roles y evento de captación; diseñar Mi día, listado/tablero y ficha con el estilo de Lici.
2. **Circuito comercial básico:** acceso, empresa/contacto/prospecto, negocio persistente, tareas y trazabilidad. Crear oportunidades manualmente debe funcionar aunque Lici no esté disponible.
3. **Circuito Lici → CRM:** entrada desde solicitud, contexto de licitación/análisis, deduplicación y asignación.
4. **Cotización y gestión:** catálogo mínimo, versiones de cotización, cierre y reportes básicos.
5. **Ampliaciones:** mensajería integrada, postventa, renovaciones, automatizaciones y comisiones según prioridades.

Continuar sobre la base vigente React/TypeScript/Vite/Tailwind de `interfaz_licitigo`, con FastAPI y el proyecto Supabase configurado allí (`jwxdwszinjdhzoierizm`). Reutilizar sus patrones de componentes, autenticación, cliente API e integración Telegram. No iniciar desarrollo desde la copia Angular ni apuntar por defecto a su base anterior. La decisión entre aplicación separada en `lici-crm` y módulo dentro de Lici, así como los permisos de acceso a la base, requiere revisar el despliegue antes de implementar. Compartir diseño no implica compartir todos los accesos. El bot actual resuelve alertas y consultas de licitaciones; cualquier captura de solicitudes comerciales desde Telegram será una ampliación explícita.

La lista de entregas verificables se mantiene en [todo.md](todo.md). No se han iniciado tareas de implementación.

## Riesgos y decisiones abiertas

| Tema | Consecuencia | Tratamiento propuesto |
|---|---|---|
| Abrir un negocio por cada visita/desbloqueo | Ruido y duplicados en la cartera | Separar señales de solicitudes explícitas y vincular oportunidades existentes |
| Mezclar monto SEACE y monto comercial | Proyecciones de ventas incorrectas | Mostrar ambos con etiquetas y cálculos separados |
| Copiar todas las funciones de las referencias | Primera versión demasiado extensa | Entregar primero el circuito de captación a cotización |
| Tomar el tablero de Equipo como funcional | Expectativas falsas de persistencia | Usarlo como referencia y construir almacenamiento real |
| Integración de WhatsApp/correo | Dependencia de cuentas, proveedor y permisos | Acordar canal y alcance antes de prometer bandeja/envíos |
| Fusionar prospectos por coincidencias débiles | Pérdida de historial | Normalización, coincidencias sugeridas y revisión |

Por concretar en la conversación: criterios de vinculación de solicitudes a negocios existentes y gestión de señales; servicios prioritarios además de ISO; roles y visibilidad; necesidad de WhatsApp integrado en el lanzamiento; etapas de venta efectivas; traspaso a operaciones y renovaciones; datos que se migrarán del CRM actual.
