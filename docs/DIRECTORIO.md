# Directorio de empresas y contactos

Actualización: 21/10/2026.

## Navegación

El menú tiene una sola entrada **Directorio**. La pestaña inicial es **Empresas** y la segunda es **Contactos**. La URL mantiene la pestaña y los filtros al recargar o compartir un enlace.

- `/directorio`: empresas, RUC, contactos, negocios abiertos, asesores y valor abierto.
- `/directorio?vista=contactos`: personas, empresa asociada, correo, teléfono y asesores de esa organización.
- `/directorio/empresas/UUID`: ficha de una empresa con datos generales, contactos, negocios y cotizaciones.

La búsqueda de empresas también considera nombres y correos de sus contactos. La búsqueda de personas considera nombre, correo, teléfono, empresa y RUC. El filtro de origen corresponde al origen registrado de la empresa. Al limpiar filtros se mantiene la pestaña seleccionada.

El número de contactos de una fila abre la pestaña Contactos filtrada por esa empresa. El nombre de una empresa abre su ficha; al volver se conservan los filtros del directorio de origen. Desde un negocio también se puede abrir la empresa mediante su enlace de navegación.

Las rutas anteriores `/empresas` y `/contactos` redirigen a Directorio y conservan búsqueda, origen y empresa. La primera abre Empresas y la segunda Contactos. Los enlaces guardados siguen siendo válidos.

## Datos y cálculos

Empresa y contacto mantienen sus registros y relaciones existentes. Una organización puede tener varias personas; no se fusionan personas ni se duplican empresas al cambiar de vista. **No requiere una migración SQL adicional.**

El listado muestra el primer contacto registrado como referencia visual y permite consultar a todos; no asigna una condición formal de contacto principal. Los asesores se obtienen de los negocios y prospectos de la organización, por lo que pueden aparecer varios. No se inventa un propietario único para la empresa.

El valor abierto suma el importe vigente de sus negocios que no están Ganados ni Perdidos. No suma versiones de cotizaciones, para evitar contar varias veces una misma oferta. El número de cotizaciones sí incluye todas sus versiones históricas. La ficha permite abrir el documento comercial existente y conservar su seguimiento.

Se utiliza el estado del espacio autorizado que ya entrega la API. Los permisos y el alcance actual por espacio se conservan. Esta entrega no agrega edición/fusión de empresas o contactos, un campo de cargo ni una asignación formal de contacto principal. El alta continúa desde **Registrar prospecto**, con las reglas existentes de vinculación por RUC y correo.

## Verificación

Recorridos de navegador con una empresa, dos personas, dos negocios y dos versiones de propuesta; comprobación de asociaciones y valor sin sumar versiones. Se verifica apertura del documento, retorno del foco, mantenimiento de filtros, pestaña al limpiar, rutas antiguas, empresa sin relaciones, registro inexistente y acceso desde la ficha de negocio. La consulta no modifica la revisión ni los datos del espacio.

Revisión visual a 1440 px y 375 px. Las tablas se desplazan horizontalmente dentro de su contenedor en pantallas pequeñas. Las pruebas usan datos ficticios separados de Supabase. También se mantienen los recorridos de prospectos, cotizaciones, catálogo, errores y navegación móvil.

Para obtener esta actualización: detener los servicios, ejecutar `git pull --ff-only`, conservar la configuración local de `backend/.env` y arrancar con `npm start`. Si Git avisa cambios locales, guardarlos antes de actualizar; no sobrescribirlos.
