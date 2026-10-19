# Lici CRM — entregas propuestas

## Revisión LiciHub del 19/10/2026

- [x] Encender API local y verificar acceso al CRM en 5174.
- [x] Revisar videos, comprobar audio y registrar requisitos con tiempos/fuentes.
- [x] Revisar navegación CRM/Bandeja de referencia e investigar documentación oficial 360dialog/n8n.
- [x] Actualizar marca visible del CRM y del Portal Clientes a LiciHub; conservar compatibilidad del origen técnico.
- [x] Documentar 32 requisitos, flujos, fases y escenarios de aceptación en [../docs/LICIHUB_FLUJOS_Y_REQUISITOS.md](../docs/LICIHUB_FLUJOS_Y_REQUISITOS.md).
- [ ] Normalizar datos y preparar acceso/eventos durables en espacio Supabase de prueba.
- [ ] Implementar botón de asesoría/cotización en Portal Clientes con confirmación y recepción CRM sin duplicados.
- [ ] Completar gestión de contactos, usuarios asignables, llamadas y propuestas con varias partidas.
- [ ] Conectar número de prueba 360dialog y construir bandeja con ventana, plantillas y comentarios internos.
- [ ] Implementar las dos ramas del bot n8n con derivación humana persistida y pausa de respuestas automáticas.

La revisión detalla qué está observado/solicitado y qué se propone. El video de hoy tiene pista casi silenciosa: sus requisitos nuevos se atribuyen a lo visible. Los checks del plan histórico de abajo se refieren al piloto local, no a las nuevas integraciones.

Estado actualizado al 16 de octubre de 2026: primera entrega local implementada y probada. Las casillas marcadas se verificaron con datos ficticios; no implican despliegue ni integración real. Las tareas mixtas permanecen pendientes aunque tengan una parte construida. Alcance y límites en [../docs/ESTADO.md](../docs/ESTADO.md); detalle de producto en [plan.md](plan.md).

Base vigente confirmada por inspección: `../interfaz_licitigo/` (React 19 + TypeScript + Vite + Tailwind CSS 4, FastAPI, Supabase y bot Telegram). Usar sus estilos, componentes, contratos API y configuración de base; `../lici-web/` corresponde a la versión anterior en Angular.

## 0. Cerrar decisiones del primer alcance
- [ ] Acordar evento Lici → CRM, etapas comerciales y servicios iniciales.
- [ ] Definir roles, visibilidad y prioridad de mensajería integrada.
- [x] Registrar criterios de éxito: captar, asignar, seguir y cotizar una oportunidad sin perder su origen.
Verificación: recorrido de un ejemplo desde Lici y otro desde referido, con responsables y resultados esperados.
Dependencias: ninguna. Alcance: pequeño, documentos del plan.

## 1. Prototipo de navegación e identidad compartida
- [x] Representar Mi día, tablero/lista y ficha de negocio usando los tokens existentes de Lici.
- [x] Mostrar origen, próxima acción y contexto Lici en el lugar acordado.
- [x] Resolver estados vacíos, carga, error y uso en escritorio/móvil.
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
- [x] Crear o vincular una empresa, permitiendo datos incompletos explícitos.
- [ ] Asociar uno o varios contactos y consultar su historial.
- [ ] Detectar coincidencias por RUC y sugerir revisión de posibles contactos duplicados.
Verificación: crear, consultar tras recargar y completar un registro; probar coincidencia exacta y teléfono compartido.
Dependencias: 2. Alcance: medio, entidades/API/ficha; dividir si supera cinco archivos principales.

## 4. Captación manual de prospectos
- [x] Registrar origen, interés y responsable.
- [ ] Calificar o descartar conservando motivo e historial.
- [ ] Vincular empresa/contacto existentes sin duplicarlos.
Verificación: alta por referido y alta por WhatsApp manual; recarga y validación de relaciones.
Dependencias: 3. Alcance: medio, entrada de prospectos.

## 5. Negocio y seguimiento de etapas
- [x] Convertir un prospecto calificado en negocio y abrir un negocio adicional para una empresa existente.
- [x] Consultar lista/tablero y cambiar etapa con persistencia e historial.
- [x] Filtrar por responsable, origen y servicio manteniendo montos comerciales separados de los de licitación.
Verificación: convertir, mover, recargar y consultar; probar fallo de guardado y aislamiento por rol.
Dependencias: 4. Alcance: medio, pipeline comercial.

## Punto de revisión B
- [ ] Flujo manual prospecto → negocio funciona con persistencia y permisos.

## 6. Próxima acción y actividades
- [x] Registrar nota, llamada realizada, tarea o reunión sin enviar comunicaciones por defecto.
- [x] Mostrar pendientes/vencidos y completar tareas con historial.
- [x] Exponer próximos pasos en ficha, tablero y Mi día.
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
- [x] Ofrecer vista «Señales Lici» y permitir conversión por asesor cuando confirme interés, conservando el historial.
Verificación: varios desbloqueos de la misma empresa, reintento, análisis tardío y solicitud posterior; no duplicar empresa/negocio ni etiquetar una recomendación como requisito.
Dependencias: 4 y contrato de eventos de 7. Alcance: medio, señales y vista de prospectos.

## 8. Contexto Lici en la ficha
- [ ] Mostrar licitación, fechas y análisis con fuente y fecha de actualización.
- [ ] Distinguir requisitos, recomendaciones y necesidad confirmada por el asesor.
- [x] Mostrar ausencia de análisis o fuente no disponible sin bloquear la gestión comercial.
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
- [x] Guardar versión, vigencia y condiciones asociadas al negocio.
- [x] Mantener las versiones históricas al modificar catálogo o emitir una nueva propuesta.
Verificación: cálculos con redondeo, cambios de precios y versiones; revisión visual del documento de salida si se incluye PDF.
Dependencias: 9. Alcance: medio; generación PDF y envío podrán dividirse en entregas propias.

## 11. Cierre comercial
- [x] Registrar ganado o perdido con datos/motivos requeridos.
- [x] Distinguir cierre comercial de cobro y entrega.
- [ ] Conservar historial y definir el siguiente responsable tras ganar.
Verificación: venta ganada con saldo pendiente, venta perdida y eventual reapertura con trazabilidad.
Dependencias: 6 y 10. Alcance: medio, reglas de cierre.

## Punto de revisión D
- [ ] Flujo completo desde origen hasta cotización/cierre funciona en ambos canales de captación.

## 12. Informes iniciales
- [ ] Mostrar oportunidades, conversión, ventas y pendientes por período/responsable/origen.
- [x] Excluir montos de licitaciones del ingreso comercial y separar vendido/cobrado.
- [x] Definir qué fecha y población usa cada indicador.
Verificación: conjunto pequeño de casos con totales esperados calculados independientemente y filtrado por permisos.
Dependencias: 11. Alcance: medio, consultas y panel.

## 13. Preparación del piloto
- [ ] Verificar el recorrido completo y permisos con un grupo acotado de asesores.
- [x] Revisar carga, error, estados vacíos, teclado y pantallas pequeñas.
- [ ] Acordar datos de migración, respaldo, tratamiento de errores y salida del piloto.
Verificación: pruebas específicas del flujo, compilación del proyecto elegido y sesión de uso comercial.
Dependencias: 12. Alcance: pequeño/medio, validación y documentación.

## Backlog posterior, por priorizar y descomponer
- [ ] Bandeja integrada WhatsApp/correo y registro de comunicaciones.
- [ ] Renovaciones, entrega de certificados y seguimiento postventa.
- [ ] Reglas automáticas de asignación y seguimiento.
- [ ] Comisiones, cobros, partners y campañas según reglas confirmadas.
- [ ] Migración desde CRM/HubSpot y conciliación de registros, si se solicita.

## Evidencia de esta entrega y siguiente paso

- [x] `npm run build`, `npm run lint`: correctos, sin supresiones añadidas.
- [x] 20 pruebas Python y 4 pruebas E2E Chrome, con persistencia, errores, teclado y móvil.
- [x] Documentar arquitectura, arranque, contrato de eventos y límites en `README.md` y `docs/`.
- [ ] Activar un espacio Supabase de prueba, provisionar miembros y validar permisos con cuentas reales.
- [ ] Conectar el emisor de eventos de Lici y probar un desbloqueo seguido de solicitud realista.

Avances parciales: acceso y roles están implementados en API y probados con dobles de Supabase, falta validación remota/visibilidad por asesor. El receptor Lici está preparado, falta emisor y actualización del análisis. Catálogo admite altas activas, no edición/desactivación/proveedor. Cotización admite una partida por versión, no partidas múltiples ni envío. Empresas/contactos admiten alta y consulta, no edición/fusión. Los puntos de revisión con datos reales y equipo comercial siguen abiertos. Comandos de ejecución y verificación en [../README.md](../README.md).
