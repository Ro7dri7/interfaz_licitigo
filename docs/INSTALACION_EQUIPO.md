# Instalación del CRM en otra computadora

Repositorio privado: https://github.com/Favianlc/licihub-crm. Cada integrante necesita acceso al repositorio. El CRM se instala de forma independiente; no necesita tener descargado el Portal Clientes.

## 1. Descargar e instalar

Requisitos: Git, Node.js 24 LTS con npm y Python 3.12 o posterior. Google Chrome es necesario solo para las pruebas de navegador.

En PowerShell:

```powershell
git clone https://github.com/Favianlc/licihub-crm.git
cd licihub-crm
npm ci
py -3 -m venv backend/.venv
& '.\backend\.venv\Scripts\python.exe' -m pip install -r backend/requirements.txt
Copy-Item backend/.env.example backend/.env
```

No es necesario activar el entorno virtual: el lanzador lo encuentra automáticamente. En macOS/Linux, crear el entorno con `python3 -m venv backend/.venv`, instalar con `backend/.venv/bin/python -m pip install -r backend/requirements.txt` y copiar la plantilla con `cp backend/.env.example backend/.env`.

## 2. Probar sin conexión a la base compartida

La plantilla inicia en modo demo, con ejemplos ficticios guardados únicamente en ese equipo. Abrir dos terminales en la carpeta del repositorio:

```powershell
# Terminal 1
npm run api
```

```powershell
# Terminal 2
npm run dev
```

Abrir http://127.0.0.1:5174. La demo no pide contraseña y no envía sus registros a Supabase. Cada computadora tiene su propia demo. `Ctrl+C` detiene cada servicio.

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

El administrador del proyecto ejecuta las migraciones **una sola vez por base**, no una vez por computadora. En el proyecto compartido actual ya existen 002/003, espacio y administrador; siguen pendientes:

1. [006_cotizaciones_multiples.sql](../backend/migrations/006_cotizaciones_multiples.sql): partidas, documento comercial y eventos de envío/aceptación/rechazo.
2. [007_catalogo_iso.sql](../backend/migrations/007_catalogo_iso.sql): 540 variantes ISO (375 individuales y 165 paquetes), sin cursos. Ya contiene el UUID del espacio actual. Alternativamente, cargar el catálogo desde su botón administrativo después de 006.

Respaldar la base y detener las API del CRM antes de la migración. No ejecutar 001, no repetir 004 ni reejecutar 003 después de 006. Para una base nueva o una instalación anterior en inglés, consultar [SUPABASE_RELACIONAL.md](SUPABASE_RELACIONAL.md): requiere las tablas del portal y un orden diferente. No copiar el UUID actual a otro proyecto.

Reiniciar la API después de configurar el entorno. En las dos terminales:

```powershell
# Terminal 1
npm run api
```

```powershell
# Terminal 2, en lugar de npm run dev
npm run dev:https
```

Abrir exactamente https://127.0.0.1:5174. El certificado autofirmado es para desarrollo local. Iniciar sesión con una cuenta habilitada en el CRM. Todas las computadoras que usan ese proyecto/espacio ven los mismos registros; no es una copia de datos independiente.

Para comprobar la base sin modificar registros:

```powershell
& '.\backend\.venv\Scripts\python.exe' scripts/supabase_status.py
```

La ampliación queda lista cuando muestra `schema_version: 2`, `quote_schema_ready: true` y el catálogo cargado. Nunca imprime la clave ni datos de clientes.

## 4. Actualizar y verificar

Con los servidores detenidos y sin cambios locales pendientes:

```powershell
git pull --ff-only
npm ci
& '.\backend\.venv\Scripts\python.exe' -m pip install -r backend/requirements.txt
npm run build
npm run lint
& '.\backend\.venv\Scripts\python.exe' -m unittest discover -s backend -t .
npm run test:db
npm run test:e2e
```

Reiniciar ambos servicios. Las pruebas usan datos ficticios y puertos separados 5175/8002; deben estar libres. El catálogo seleccionado ya está incluido en JSON y SQL: no hace falta el Excel original para ejecutar el CRM. Regenerarlo desde el export original requiere instalar opcionalmente `openpyxl` y conservar las reglas documentadas en [COTIZACIONES.md](COTIZACIONES.md).

## 5. Archivos locales y colaboración

Git excluye `.env`, entornos Python, `node_modules`, certificados de desarrollo, SQLite, logs, capturas y resultados de pruebas. No copiar esos archivos al repositorio. Para trabajar en una mejora, crear una rama y compartir sus cambios mediante un pull request. No sobrescribir cambios locales para actualizar.

En GitHub, el propietario agrega a los compañeros desde **Settings → Collaborators → Add people**. El enlace privado por sí solo no concede acceso. No se enviaron invitaciones automáticamente.
