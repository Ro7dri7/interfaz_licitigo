# Cotizaciones ISO y catálogo comercial

## Alcance aprobado el 20/10/2026

Varias certificaciones o servicios por propuesta; paquetes del catálogo original; versiones con precios y datos comerciales congelados; registro de envío, aceptación y rechazo con actor, fecha, destinatario y evidencia; documento comercial imprimible/PDF. Registrar envío no realiza una comunicación externa, y registrar aceptación no equivale a cobro ni cierre automático del negocio.

Emisor indicado por el usuario: INTERCERT LATAM S.A.C., RUC 20612137880, CAL.MARTIN DE MURUA NRO. 150 INT. 1109 URB. MARANGA ET. SIETE LIMA - LIMA - SAN MIGUEL. Las condiciones de pago son editables y obligatorias en el formulario; no se inventa un acuerdo. **El usuario confirmó que los precios del Excel se tratarán como importes con IGV incluido.** Las propuestas nuevas parten de IGV 18 % incluido: se desglosa sin aumentar el total. Tasa y tratamiento siguen editables explícitamente.

## Catálogo de origen

Archivo `hubspot-crm-exports-todos-productos-2026-09-23.xlsx`, hoja `Todos productos`, 874 registros. SHA-256: `76ecba4c3fa1274df441c5ebc63a506c5adc4c839b396ac2d202aa4e61abfd89`. El export declara una dimensión A1 incorrecta; la extracción restablece dimensiones antes de leer y no modifica el original.

Se seleccionan filas activas cuyo nombre comienza con ISO/ISO-IEC o «Pack de N ISOS» y corresponde a certificación inicial, recertificación o seguimiento anual. Resultado: **540 referencias, incluidas 165 de paquetes**. Se excluyen cursos, implementación, auditoría interna, cambios de alcance/dirección, HACCP, buenas prácticas, PESV y otros productos ajenos al alcance solicitado. Se usa únicamente `Price PEN`; COP/MXN se conservan en el archivo original, no se convierten ni importan.

Los nombres y versiones normativas se preservan como catálogo comercial suministrado, sin afirmar su validez normativa ni corregirlos silenciosamente. Las diferencias de modalidad y tamaño de empresa son referencias separadas; no se reduce todo a un precio por norma. Cada paquete conserva el precio del Excel, sin recalcularlo por suma de componentes.

`backend/catalogo_iso.json` conserva ID determinista, ID original de HubSpot, código, fila de origen, categoría y precio en céntimos. La importación administrativa desde Catálogo agrega referencias ausentes y no sobrescribe precios existentes ni crea empresas/contactos de ejemplo. Repetirla no duplica productos. La extracción reproducible está en `scripts/extract_iso_catalog.py` y usa openpyxl en el runtime de documentos.

Los nombres Lucía Mendoza (prueba) y Diego Salazar (prueba) son responsables ficticios seleccionables para recorrer el flujo. No son cuentas Auth, no conceden permisos y no sustituyen la futura asignación por usuario.

## Criterios de aceptación

- Dos o más partidas, incluyendo un paquete, conservan precios y suman en céntimos; descuento e impuesto se redondean una vez sobre los totales.
- Una nueva versión conserva el documento anterior; modificar datos del catálogo o de la empresa no reescribe una propuesta nueva ya guardada.
- Los cambios de estado son eventos inmutables; aceptar requiere una propuesta enviada y evidencia de la confirmación. No se registra un envío automático inexistente.
- El documento muestra emisor, destinatario, contacto, asesor, número/versión, vigencia, partidas, importes y condiciones, con impresión en varias páginas.
- El cliente autenticado sin membresía no accede al CRM y un asesor no importa productos.
- Empresas lista organizaciones por RUC; Contactos lista personas asociadas. Una empresa puede tener varios contactos y un contacto no equivale a una empresa nueva.

La evolución de PostgreSQL se entrega como SQL adicional para ejecución manual, conforme a la preferencia del usuario; no se aplican migraciones remotas automáticamente.

## Activación en el espacio actual

El espacio existente es `18d253e3-338e-42f7-8287-a949961b829d`. Los scripts 002/003 y la provisión de administrador ya fueron ejecutados por el usuario. **Los siguientes archivos todavía no están aplicados remotamente:**

1. Detener la API y respaldar Supabase. Ejecutar completo [006_cotizaciones_multiples.sql](../backend/migrations/006_cotizaciones_multiples.sql) en SQL Editor. Agrega los datos congelados del documento y la tabla `licihub_crm.eventos_cotizacion`, con RLS y eventos inmutables. Conserva cotizaciones, importes e identidades anteriores. Las 13 tablas iniciales pasan a ser 14.
2. Ejecutar [007_catalogo_iso.sql](../backend/migrations/007_catalogo_iso.sql). Ya incluye el UUID del espacio actual; agrega las 540 referencias ISO, sin empresas/contactos ficticios ni usuarios nuevos. Repetirlo conserva los precios existentes y no duplica productos. Alternativa: después de 006, un administrador puede pulsar **Importar catálogo ISO (540)** en Catálogo; no necesita ambos mecanismos.
3. Reiniciar `npm run api`, mantener `npm run dev:https` y recargar el CRM. Comprobar `scripts/supabase_status.py`: `schema_version: 2`, `quote_schema_ready: true` y al menos 540 productos. La API bloquea nuevas cotizaciones mientras falte 006; las demás funciones mantienen su contrato anterior.

No repetir 004 ni ejecutar 001. No reejecutar 003 después de 006: reemplazaría las funciones nuevas por el contrato anterior. Las migraciones no cambian las tablas del portal ni suben la demo SQLite. Antes de 006 el código puede volver a la versión anterior. Después de guardar propuestas múltiples, una reversión exige una versión compatible con sus partidas/eventos; no borrar columnas ni eventos ni restaurar el backend de una sola partida sobre esos datos. Para un fallo durante el SQL, su transacción revierte completa; conservar el error y el respaldo.

La demo local actualiza su CHECK de totales mediante reconstrucción transaccional de `quotes` y crea un respaldo consistente `demo.before-multiple-quotes.sqlite3`; conserva filas, revisión e historial. Los documentos anteriores mantienen su fórmula original y sus precios: **no se les cambia retrospectivamente el impuesto**. Como no tenían instantánea del emisor/cliente, su vista usa los datos actuales disponibles; las propuestas nuevas sí congelan esos datos.

## Flujo para el asesor

1. Registrar una empresa y una persona de contacto, o recibir una solicitud explícita. Una señal de desbloqueo permanece como prospecto hasta confirmar interés.
2. Abrir el negocio y elegir **Cotizar**. Añadir entre 1 y 50 partidas, individuales o paquetes, con cantidades; una referencia repetida se representa con cantidad, no con dos filas idénticas. Revisar descuento, IGV incluido, vigencia y condiciones comerciales/pago.
3. Guardar el borrador y revisar el documento de INTERCERT. Los importes se calculan en céntimos: descuento redondeado sobre el subtotal; IGV incluido = importe descontado × 18 / 118, redondeado una vez. El total ya contiene ese IGV. Por ejemplo, S/ 4,440.00 se desglosa en base S/ 3,762.71 + IGV S/ 677.29 y mantiene total S/ 4,440.00.
4. Imprimir o guardar PDF. Enviar por el canal acordado fuera del CRM y luego **Registrar envío**, indicando destinatario, canal y evidencia. Esto avanza el negocio temprano a Cotización enviada; no confirma entrega del proveedor de correo/WhatsApp.
5. Cuando el cliente confirme, **Registrar aceptación** o **Registrar rechazo**, con evidencia. Solo se permite tras envío. Una propuesta vencida no se envía ni acepta: crear una versión vigente. Aceptar no marca Ganado, no cobra, no emite certificado ni obtiene firma electrónica.
6. Cada versión y evento permanece inmutable. Para ajustar una oferta, preparar otra versión. Tras una aceptación, una necesidad comercial nueva se registra como otro negocio; solo puede haber una propuesta aceptada por negocio. El cierre Ganado/Perdido se realiza aparte.

**Empresas** representa organizaciones (RUC, contactos y negocios asociados). **Contactos** representa personas con correo/teléfono y vínculo a su empresa: dos personas de la misma organización aparecen como dos contactos y una empresa. El listado de empresas permite ir a sus contactos.

## Verificación de esta entrega

Build y lint correctos; 42 pruebas Python, 15 PostgreSQL/PGlite y 5 recorridos Chrome. Se verificaron suma de partidas, IGV incluido, versiones, precios congelados, rechazo/vencimiento, envío/aceptación auditados, reinicio, permisos, repetición del catálogo y actualización no destructiva del CHECK SQLite anterior con respaldo. PDF A4 revisado visualmente, escritorio y móvil 375 px; una propuesta breve de dos partidas y aceptación cabe en una página. Las pruebas utilizan datos ficticios y puertos 5175/8002, sin cargar ejemplos en Supabase.

Pendientes: envío real por correo/360dialog, bandeja y automatizaciones n8n, firma/aceptación por enlace del cliente, PDF generado en servidor, edición/desactivación del catálogo, usuarios asesores reales y prueba del flujo con las cuentas comerciales remotas.
