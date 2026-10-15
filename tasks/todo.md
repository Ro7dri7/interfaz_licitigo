# Lici CRM — entregas propuestas

Estado: planificación inicial del 15 de octubre de 2026. Las tareas de implementación están pendientes; prioridades sujetas a la conversación. Detalle de producto en [plan.md](plan.md).

Base vigente confirmada por inspección: `../interfaz_licitigo/` (React 19 + TypeScript + Vite + Tailwind CSS 4, FastAPI, Supabase y bot Telegram). Usar sus estilos, componentes, contratos API y configuración de base; `../lici-web/` corresponde a la versión anterior en Angular.

## 0. Cerrar decisiones del primer alcance
- [ ] Acordar evento Lici → CRM, etapas comerciales y servicios iniciales.
- [ ] Definir roles, visibilidad y prioridad de mensajería integrada.
- [ ] Registrar criterios de éxito: captar, asignar, seguir y cotizar una oportunidad sin perder su origen.
Verificación: recorrido de un ejemplo desde Lici y otro desde referido, con responsables y resultados esperados.
Dependencias: ninguna. Alcance: pequeño, documentos del plan.

## 1. Prototipo de navegación e identidad compartida
- [ ] Representar Mi día, tablero/lista y ficha de negocio usando los tokens existentes de Lici.
- [ ] Mostrar origen, próxima acción y contexto Lici en el lugar acordado.
- [ ] Resolver estados vacíos, carga, error y uso en escritorio/móvil.
Verificación: recorrido visual con datos ficticios y revisión junto a la interfaz existente de Lici.
Dependencias: 0. Alcance: medio, prototipo y componentes visuales; rutas definitivas por decidir.

## 2. Acceso del equipo comercial
- [ ] Permitir ingreso según los roles acordados.
- [ ] Aplicar permisos tanto en API como en interfaz.
- [ ] Impedir acceso de una cuenta cliente a información comercial interna.
Verificación: pruebas de autorización con cuentas de cada rol y acceso directo a rutas/API.
Dependencias: 0–1. Alcance: medio, autenticación/API/guardas.

## Punto de revisión A
- [ ] Navegación y diseño revisados; modelo de acceso definido antes de conectar datos reales.

## 3. Empresa y contactos asociados
- [ ] Crear o vincular una empresa, permitiendo datos incompletos explícitos.
- [ ] Asociar uno o varios contactos y consultar su historial.
- [ ] Detectar coincidencias por RUC y sugerir revisión de posibles contactos duplicados.
Verificación: crear, consultar tras recargar y completar un registro; probar coincidencia exacta y teléfono compartido.
Dependencias: 2. Alcance: medio, entidades/API/ficha; dividir si supera cinco archivos principales.

## 4. Captación manual de prospectos
- [ ] Registrar origen, interés y responsable.
- [ ] Calificar o descartar conservando motivo e historial.
- [ ] Vincular empresa/contacto existentes sin duplicarlos.
Verificación: alta por referido y alta por WhatsApp manual; recarga y validación de relaciones.
Dependencias: 3. Alcance: medio, entrada de prospectos.

## 5. Negocio y seguimiento de etapas
- [ ] Convertir un prospecto calificado en negocio y abrir un negocio adicional para una empresa existente.
- [ ] Consultar lista/tablero y cambiar etapa con persistencia e historial.
- [ ] Filtrar por responsable, origen y servicio manteniendo montos comerciales separados de los de licitación.
Verificación: convertir, mover, recargar y consultar; probar fallo de guardado y aislamiento por rol.
Dependencias: 4. Alcance: medio, pipeline comercial.

## Punto de revisión B
- [ ] Flujo manual prospecto → negocio funciona con persistencia y permisos.

## 6. Próxima acción y actividades
- [ ] Registrar nota, llamada realizada, tarea o reunión sin enviar comunicaciones por defecto.
- [ ] Mostrar pendientes/vencidos y completar tareas con historial.
- [ ] Exponer próximos pasos en ficha, tablero y Mi día.
Verificación: tarea con vencimiento y zona horaria, finalización, recarga y lectura desde ambas vistas.
Dependencias: 5. Alcance: medio; agenda mensual avanzada puede ser entrega separada.

## 7. Recepción de oportunidades desde Lici
- [ ] Recibir solicitudes de asesoría/cotización y crear o vincular un negocio según empresa/contacto y necesidad.
- [ ] Conservar origen, identificador del evento y referencias a licitación/análisis.
- [ ] Reintentar sin duplicados y mostrar fallos de integración.
Verificación: solicitudes de ambos tipos, repetida, incompleta y fallo temporal; negocio abierto compatible y necesidad distinta; también entrada externa sin licitación.
Dependencias: 5 y criterios de vinculación en 0. Alcance: medio, contrato de integración y recepción.

## 7b. Señales Lici en prospectos
- [ ] Registrar desbloqueos y enriquecerlos cuando llegue el análisis sin crear negocios automáticamente.
- [ ] Diferenciar requisito detectado, recomendación y análisis pendiente; agrupar eventos en la ficha existente.
- [ ] Ofrecer vista «Señales Lici» y permitir conversión por asesor cuando confirme interés, conservando el historial.
Verificación: varios desbloqueos de la misma empresa, reintento, análisis tardío y solicitud posterior; no duplicar empresa/negocio ni etiquetar una recomendación como requisito.
Dependencias: 4 y contrato de eventos de 7. Alcance: medio, señales y vista de prospectos.

## 8. Contexto Lici en la ficha
- [ ] Mostrar licitación, fechas y análisis con fuente y fecha de actualización.
- [ ] Distinguir requisitos, recomendaciones y necesidad confirmada por el asesor.
- [ ] Mostrar ausencia de análisis o fuente no disponible sin bloquear la gestión comercial.
Verificación: ficha con y sin contexto; análisis pendiente/error/listo; enlace a origen y control de acceso.
Dependencias: 7 y 7b. Alcance: medio, API de lectura y panel contextual.

## Punto de revisión C
- [ ] Oportunidad realista de Lici llega una sola vez y un asesor entiende por qué atenderla.

## 9. Catálogo comercial mínimo
- [ ] Crear servicios/paquetes con moneda, precio y estado activo.
- [ ] Representar proveedor/modalidad cuando sean necesarios para el alcance inicial.
- [ ] Seleccionar partidas desde un negocio.
Verificación: producto activo/inactivo, precio cero explícito y moneda; persistencia de selección.
Dependencias: 5. Alcance: medio, catálogo mínimo.

## 10. Cotización versionada
- [ ] Calcular partidas, cantidades, descuentos, impuestos configurados y total.
- [ ] Guardar versión, vigencia y condiciones asociadas al negocio.
- [ ] Mantener las versiones históricas al modificar catálogo o emitir una nueva propuesta.
Verificación: cálculos con redondeo, cambios de precios y versiones; revisión visual del documento de salida si se incluye PDF.
Dependencias: 9. Alcance: medio; generación PDF y envío podrán dividirse en entregas propias.

## 11. Cierre comercial
- [ ] Registrar ganado o perdido con datos/motivos requeridos.
- [ ] Distinguir cierre comercial de cobro y entrega.
- [ ] Conservar historial y definir el siguiente responsable tras ganar.
Verificación: venta ganada con saldo pendiente, venta perdida y eventual reapertura con trazabilidad.
Dependencias: 6 y 10. Alcance: medio, reglas de cierre.

## Punto de revisión D
- [ ] Flujo completo desde origen hasta cotización/cierre funciona en ambos canales de captación.

## 12. Informes iniciales
- [ ] Mostrar oportunidades, conversión, ventas y pendientes por período/responsable/origen.
- [ ] Excluir montos de licitaciones del ingreso comercial y separar vendido/cobrado.
- [ ] Definir qué fecha y población usa cada indicador.
Verificación: conjunto pequeño de casos con totales esperados calculados independientemente y filtrado por permisos.
Dependencias: 11. Alcance: medio, consultas y panel.

## 13. Preparación del piloto
- [ ] Verificar el recorrido completo y permisos con un grupo acotado de asesores.
- [ ] Revisar carga, error, estados vacíos, teclado y pantallas pequeñas.
- [ ] Acordar datos de migración, respaldo, tratamiento de errores y salida del piloto.
Verificación: pruebas específicas del flujo, compilación del proyecto elegido y sesión de uso comercial.
Dependencias: 12. Alcance: pequeño/medio, validación y documentación.

## Backlog posterior, por priorizar y descomponer
- [ ] Bandeja integrada WhatsApp/correo y registro de comunicaciones.
- [ ] Renovaciones, entrega de certificados y seguimiento postventa.
- [ ] Reglas automáticas de asignación y seguimiento.
- [ ] Comisiones, cobros, partners y campañas según reglas confirmadas.
- [ ] Migración desde CRM/HubSpot y conciliación de registros, si se solicita.

No se fijan comandos de pruebas/build para `lici-crm` todavía: solo contenía imágenes al iniciar la revisión. Se definirán al seleccionar la estructura sobre React. El proyecto vigente `interfaz_licitigo` incluye `npm run build` y `npm run lint`; estos comandos verifican esa aplicación, no un CRM separado. La inspección de su configuración y del código del bot no sustituye pruebas de conexión a Supabase ni de funcionamiento de Telegram.
