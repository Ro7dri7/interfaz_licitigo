# Instalación del equipo

Portal, CRM y bot están en la rama `main` del repositorio compartido, dentro de `portal/` y `crm/`. No descargar ramas separadas.

Seguir [la guía de instalación y comandos de la raíz](../../README.md). Para conservar archivos privados, colas pendientes y datos de las instalaciones anteriores, seguir [la guía de actualización](../../docs/ACTUALIZACION.md) antes de retirar las copias antiguas.

El administrador entrega la configuración privada y habilita la cuenta en `licihub_crm.miembros`. Una cuenta del portal no otorga acceso al CRM. [Base, migraciones y membresías](SUPABASE_RELACIONAL.md).

En modo Supabase abrir exactamente la URL HTTPS de `CRM_ORIGIN`. `localhost`, `127.0.0.1`, HTTP y HTTPS son orígenes distintos. Los compañeros configurados con el mismo proyecto y espacio ven los registros compartidos. La plantilla demo guarda ejemplos locales por computadora y no solicita login.

Las migraciones se aplican una sola vez por base. Esta reorganización no requiere SQL ni volver a crear el espacio. El usuario confirmó SQL 008 para Telegram. Las claves, el bot token y los archivos `.env` permanecen fuera de Git.

El catálogo JSON y los scripts SQL ya están incluidos: no se necesita el Excel original para ejecutar el CRM. Las pruebas de navegador requieren Chrome y utilizan puertos 5175/8002 con datos temporales.

Para diagnosticar un problema, compartir el texto exacto de la terminal, el comando, la carpeta y la dirección abierta, sin claves ni contraseñas.
