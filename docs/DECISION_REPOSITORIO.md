# Portal, CRM y bot en main

Fecha: 27/10/2026.

El equipo necesita descargar y actualizar todas las aplicaciones desde una sola rama. Mantener el portal en `main` y el CRM en `licihub-crm` provocaba instalaciones con comandos y archivos de configuración de la aplicación equivocada.

`main` contiene ahora dos carpetas de aplicación: `portal/` y `crm/`. El bot pertenece al backend del portal. Los comandos de la raíz instalan y ejecutan los componentes con su directorio de trabajo explícito; cada aplicación conserva sus dependencias y su entorno Python. Se mantienen ambos lockfiles de Node y no se introducen dependencias compartidas por hoisting.

El traslado del portal conserva íntegramente sus archivos. La incorporación del CRM conserva sus archivos y registra su historial como segundo padre de la integración. No se reescribe ni se fuerza el historial remoto. La rama anterior deja de ser necesaria para instalar el producto; se conserva inicialmente como referencia histórica para las copias que aún no migraron.

No cambia el modelo relacional, la autorización comercial, el contrato de recepción ni el origen de las solicitudes. Las credenciales y las colas locales se trasladan por separado y siguen excluidas de Git. No se ejecuta SQL.

El bot no se inicia con `npm start`: su proceso de polling requiere una sola instancia por token. Los otros integrantes pueden ejecutar portal y CRM y conversar con ese bot existente.

La revisión incluye compilación de las interfaces, pruebas de Python, arranque, migraciones locales, integración de solicitudes y recorridos del CRM en Chrome. El despliegue 24/7 del bot y una bandeja bidireccional de mensajería continúan fuera de esta reorganización.
