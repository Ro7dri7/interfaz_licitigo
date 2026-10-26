# Instalación del CRM en otra computadora

Repositorio compartido: https://github.com/Ro7dri7/interfaz_licitigo.git. La rama `licihub-crm` contiene el CRM; `main` contiene el Portal Clientes y el bot de Telegram. Clonar en carpetas diferentes para mantener separados sus archivos de configuración y dependencias. El CRM puede ejecutarse por separado; el flujo del bot también necesita el portal configurado.

## 1. Descargar e instalar

Requisitos: Git, Node.js 24 LTS con npm y Python 3.12 o posterior (instalación limpia verificada con Python 3.14). Google Chrome es necesario solo para las pruebas de navegador.

En PowerShell:

```powershell
git clone --branch licihub-crm --single-branch https://github.com/Ro7dri7/interfaz_licitigo.git lici-crm
cd lici-crm
npm ci
py -3 -m venv backend/.venv
& '.\backend\.venv\Scripts\python.exe' -m pip install -r backend/requirements.txt
Copy-Item backend/.env.example backend/.env
```

No es necesario activar el entorno virtual: el lanzador lo encuentra automáticamente. En macOS/Linux, crear el entorno con `python3 -m venv backend/.venv`, instalar con `backend/.venv/bin/python -m pip install -r backend/requirements.txt` y copiar la plantilla con `cp backend/.env.example backend/.env`.

## 2. Probar sin conexión a la base compartida

La plantilla inicia en modo demo, con ejemplos ficticios guardados únicamente en ese equipo. Desde la carpeta que contiene `package.json`:

```powershell
npm start
```

Este comando arranca la API y el frontend juntos y muestra la URL exacta, normalmente http://127.0.0.1:5174. La demo no pide contraseña y no envía sus registros a Supabase. Cada computadora tiene su propia demo. `Ctrl+C` detiene ambos servicios.

## 3. Usar el espacio comercial compartido

El administrador entrega por un canal privado la configuración de servidor y habilita la cuenta del integrante como miembro del CRM. No enviar contraseñas ni claves a GitHub. Una cuenta del Portal Clientes, por sí sola, no concede acceso comercial.

Editar el archivo local `backend/.env`:

```dotenv
CRM_MODE=supabase
CRM_ORIGIN=https://127.0.0.1:5174
CRM_SUPABASE_URL=https://jwxdwszinjdhzoierizm.supabase.co
CRM_SUPABASE_SECRET_KEY=
CRM_WORKSPACE_ID=18d253e3-338e-42f7-8287-a949961b829d
CRM_INGEST_KEY=
```

Completar `CRM_SUPABASE_SECRET_KEY` únicamente en el servidor local de un desarrollador autorizado; nunca en variables `VITE_*`. No hace falta configurar la clave de integración para usar el CRM. El equipo comercial puede usar un despliegue central del backend sin recibir esta clave.

El administrador ejecuta las migraciones **una sola vez por base**, no una vez por computadora. La lectura del 26/10/2026 confirmó versión 2 y 540 productos ISO en el proyecto compartido: 006/007 ya están reflejados. Para habilitar el origen Telegram, aplicar [008_origen_telegram.sql](../backend/migrations/008_origen_telegram.sql). No volver a provisionar el espacio.

Respaldar la base y detener las API del CRM antes de la migración. No ejecutar 001, no repetir 004 ni reejecutar 003 después de 006. Para una base nueva o una instalación anterior en inglés, consultar [SUPABASE_RELACIONAL.md](SUPABASE_RELACIONAL.md): requiere las tablas del portal y un orden diferente. No copiar el UUID actual a otro proyecto.

Después de editar el entorno, detener las instancias anteriores de API/frontend con `Ctrl+C` y ejecutar:

```powershell
npm start
```

Lee `backend/.env`, activa HTTPS para el frontend y usa el puerto de `CRM_ORIGIN`. Abrir exactamente https://127.0.0.1:5174 cuando esa es la dirección configurada. No sustituirla por `localhost`, HTTP ni otro puerto. El certificado autofirmado es para desarrollo local. Iniciar sesión con una cuenta habilitada en el CRM. Todas las computadoras que usan ese proyecto/espacio ven los mismos registros; no es una copia de datos independiente.

Para comprobar la base sin modificar registros:

```powershell
& '.\backend\.venv\Scripts\python.exe' scripts/supabase_status.py
```

La ampliación queda lista cuando muestra `schema_version: 2`, `quote_schema_ready: true` y el catálogo cargado. Nunca imprime la clave ni datos de clientes.

## 4. Actualizar y verificar

Si la copia existente todavía apunta a `Favianlc/licihub-crm`, cambiar su remoto desde la carpeta del CRM. Estos comandos conservan los archivos locales y establecen la rama compartida correcta:

```powershell
git remote set-url origin https://github.com/Ro7dri7/interfaz_licitigo.git
git remote set-branches origin licihub-crm
git fetch origin
git branch --set-upstream-to=origin/licihub-crm
```

No cambiar esta copia a `main`: esa rama contiene otra aplicación. Para descargar el portal y su bot en una carpeta hermana, ejecutar desde el directorio que contiene `lici-crm`:

```powershell
git clone --branch main --single-branch https://github.com/Ro7dri7/interfaz_licitigo.git interfaz_licitigo
```

La configuración y arranque del bot están en [la guía del portal](https://github.com/Ro7dri7/interfaz_licitigo/blob/main/docs/ASESORIAS_CRM.md). Ejecutar una sola instancia por token de Telegram.

Con los servidores detenidos y sin cambios locales pendientes:

```powershell
git pull --ff-only
npm ci
& '.\backend\.venv\Scripts\python.exe' -m pip install -r backend/requirements.txt
npm run build
npm run lint
npm run test:startup
& '.\backend\.venv\Scripts\python.exe' -m unittest discover -s backend -t .
npm run test:db
npm run test:e2e
```

Reiniciar ambos servicios. Las pruebas usan datos ficticios y puertos separados 5175/8002; deben estar libres. El catálogo seleccionado ya está incluido en JSON y SQL: no hace falta el Excel original para ejecutar el CRM. Regenerarlo desde el export original requiere instalar opcionalmente `openpyxl` y conservar las reglas documentadas en [COTIZACIONES.md](COTIZACIONES.md).

## 5. Archivos locales y colaboración

Git excluye `.env`, entornos Python, `node_modules`, certificados de desarrollo, SQLite, logs, capturas y resultados de pruebas. No copiar esos archivos al repositorio. Para trabajar en una mejora, crear una rama y compartir sus cambios mediante un pull request. No sobrescribir cambios locales para actualizar.

En GitHub, el propietario agrega a los compañeros desde **Settings → Collaborators → Add people**. El enlace privado por sí solo no concede acceso. No se enviaron invitaciones automáticamente.

## 6. Errores de carpeta, arranque y acceso

- **ENOENT / no encuentra package.json:** la terminal está en otra carpeta. `Test-Path package.json` debe mostrar `True`. Entrar a la subcarpeta clonada antes de instalar o arrancar.
- **No module named uvicorn:** falta el entorno Python o sus dependencias. Ejecutar `python -m venv backend/.venv` y después `& '.\backend\.venv\Scripts\python.exe' -m pip install -r backend/requirements.txt`. Reiniciar el CRM; no basta con `npm ci`, que instala únicamente las dependencias de Node.
- **No existe el comando start:** actualizar con `git pull --ff-only` desde la carpeta correcta. Conservar los cambios propios antes de actualizar.
- **Faltan dependencias del frontend:** detener el frontend y ejecutar `npm ci`. Usar Node.js 24 LTS y copiar el error completo si la instalación falla.
- **Puerto ocupado:** detener las instancias anteriores del CRM. No cambiar solamente el puerto del navegador; `npm start` mantiene coordinadas las direcciones y rechaza un puerto ocupado.
- **Origen de solicitud no permitido:** la dirección abierta no coincide exactamente con `CRM_ORIGIN`. En el entorno compartido local usar `CRM_MODE=supabase` y `CRM_ORIGIN=https://127.0.0.1:5174`, reiniciar y abrir esa misma dirección. La API rechaza la petición antes de comprobar la contraseña; el mensaje actualizado indica la URL esperada. Las variables de entorno del sistema/terminal tienen prioridad sobre el archivo si existen.
- **Primero se veía una demo y luego aparece el login:** demo y Supabase son modos diferentes. Cambiar `CRM_MODE` y reiniciar cambia de origen de datos; no convierte los ejemplos en registros compartidos. Un `git pull` no reemplaza `backend/.env`, que está excluido del repositorio.
- **Credenciales incorrectas:** después de corregir el origen, usar una cuenta que realmente exista en Supabase Auth. Escribir un correo nuevo en el login no crea una cuenta.
- **Cuenta sin acceso comercial:** el administrador debe habilitar su UUID de Auth en `licihub_crm.miembros`, dentro del espacio configurado, con `activo=true` y rol `commercial` o `admin`. No repetir 004 para añadir compañeros; usar la instrucción de alta de miembros de [SUPABASE_RELACIONAL.md](SUPABASE_RELACIONAL.md).

Si persiste un problema, compartir el texto exacto de la terminal, la URL abierta y el mensaje visible. No compartir contraseñas ni claves del archivo de entorno.
