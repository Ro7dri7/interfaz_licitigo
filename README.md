# LiciHub

Portal de licitaciones, CRM comercial y bot de Telegram en un solo repositorio y en la rama `main`.

```text
licihub/
  portal/     React, API FastAPI, bot Telegram y flujos n8n
  crm/        React, API FastAPI y migraciones del CRM
  scripts/    Instalación y arranque desde la raíz
  docs/       Instalación, actualización y decisiones
```

Las aplicaciones comparten el proyecto Supabase, pero conservan permisos, sesiones, archivos `.env` y entornos Python independientes. La reorganización no cambia tablas, registros ni UUID del espacio comercial.

## Primera instalación

Requisitos: Git, Node.js 24 o posterior y Python 3.12 o posterior, disponibles en la terminal. En PowerShell o CMD, ejecutar cada comando por separado y esperar a que termine.

```powershell
git clone --branch main --single-branch https://github.com/Ro7dri7/interfaz_licitigo.git licihub
```

```powershell
cd licihub
```

Si ya tenías las aplicaciones, seguir primero [la guía para conservar configuración y colas locales](docs/ACTUALIZACION.md).

```powershell
npm run instalar
```

Instala las dependencias de Node de ambas aplicaciones, crea sus entornos Python e instala sus `requirements.txt`. Crea las plantillas `.env` solamente si no existen; no reemplaza valores existentes ni ejecuta SQL. No requiere activar Python ni entrar a `>>>`. Puede repetirse para actualizar dependencias.

Editar estos dos archivos locales y reemplazar los marcadores por valores reales entregados por el administrador de forma privada:

| Archivo | Configuración |
| --- | --- |
| `portal/backend/.env` | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `APIMIGO_TOKEN`; `TELEGRAM_BOT_TOKEN` para vincular Telegram; `N8N_WEBHOOK_URL` para análisis ISO |
| `crm/backend/.env` | Para datos compartidos: `CRM_MODE=supabase`, `CRM_ORIGIN=https://127.0.0.1:5174`, `CRM_SUPABASE_URL`, `CRM_SUPABASE_SECRET_KEY`, `CRM_WORKSPACE_ID` |

La plantilla del CRM comienza en modo demo, con datos ficticios locales. Para trabajar con datos compartidos se debe configurar Supabase y una cuenta con membresía comercial activa. Una cuenta del portal no concede acceso al CRM.

Enlazar las claves de recepción comercial de las dos instalaciones locales:

```powershell
npm run enlazar
```

Conserva la configuración de Supabase y utiliza la clave de integración existente del CRM; si está vacía utiliza la del portal o genera una nueva. No imprime claves. Para un CRM remoto HTTPS, configurar su URL y clave de forma privada en el portal; el comando de enlace admite solamente servidores locales.

## Encender el sistema

Desde la raíz, donde está este README:

```powershell
npm start
```

Inicia la API y el frontend del portal y la API y el frontend del CRM. Si un proceso falla, detiene los servicios iniciados por ese comando. `Ctrl+C` detiene el conjunto. Detener previamente las instalaciones antiguas para liberar los puertos.

| Servicio | Dirección predeterminada |
| --- | --- |
| Portal | http://localhost:5173 |
| API del portal | http://127.0.0.1:8000/docs |
| CRM con Supabase | https://127.0.0.1:5174 |
| CRM de demostración | http://127.0.0.1:5174 |
| API del CRM | http://127.0.0.1:8001 |

Abrir el CRM exactamente en la dirección que muestre su terminal y coincida con `CRM_ORIGIN`. HTTPS local utiliza un certificado autofirmado de desarrollo. La raíz de la API del portal puede responder 404; la interfaz está en 5173.

También se puede iniciar cada aplicación por separado:

```powershell
npm run portal
```

```powershell
npm run crm
```

## Bot de Telegram

Solamente la persona encargada del bot ejecuta este comando, en otra terminal desde la raíz:

```powershell
npm run bot
```

El arranque general no inicia el bot. Mantener una sola instancia por token en todo el equipo para evitar conflictos de recepción. Los demás pueden usar el mismo bot desde Telegram sin ejecutarlo en sus computadoras. Quien lo aloje necesita conexión a Supabase, el token y acceso a la API del CRM configurada; con `127.0.0.1:8001` esa API debe estar en su propio equipo.

El bot conserva `/asesor`, las preguntas y la confirmación de envío. Solo una solicitud explícita y confirmada genera o vincula un negocio. [Flujo, diagnóstico y recuperación de solicitudes](portal/docs/ASESORIAS_CRM.md).

## Actualizar y verificar

Con los procesos detenidos y los cambios locales guardados en Git:

```powershell
git pull --ff-only origin main
```

```powershell
npm run instalar
```

Después, `npm start`. Reiniciar el bot solo en su equipo encargado. Si Git informa cambios locales o ramas divergentes, conservarlos y resolverlos antes de continuar; no descartar trabajo para actualizar.

| Comando desde la raíz | Qué verifica |
| --- | --- |
| `npm test` | Lanzadores y detención de procesos |
| `npm run test:portal` | Pruebas Python del portal/bot |
| `npm run test:crm` | Pruebas Python del CRM |
| `npm run test:integracion` | Confirmación, cola y recepción conjunta con datos temporales |
| `npm run build` | Compilación de ambas interfaces |
| `npm run lint` | Análisis estático de ambas interfaces |
| `npm --prefix crm run test:startup` | Configuración de arranque del CRM |
| `npm --prefix crm run test:db` | Migraciones en PostgreSQL embebido de pruebas |
| `npm --prefix crm run test:e2e` | Recorridos en Chrome; utiliza puertos 5175/8002 |
| `npm run diagnostico` | Recepción y clave comercial, sin crear negocios ni probar escritura en Supabase |

No se incluyen claves, cuentas privadas, SQLite locales, certificados, dependencias instaladas ni entornos Python en Git. Las migraciones compartidas se ejecutan una vez por base; esta reorganización no requiere otro SQL.

## Documentación

- [Actualizar desde las instalaciones anteriores](docs/ACTUALIZACION.md).
- [Decisión de estructura e historial](docs/DECISION_REPOSITORIO.md).
- [Portal: arquitectura, API y funcionalidades](portal/docs/DOCUMENTACION.md).
- [CRM: funcionamiento](crm/README.md), [base relacional y acceso](crm/docs/SUPABASE_RELACIONAL.md).
- [Flujos comerciales desde portal y Telegram](portal/docs/ASESORIAS_CRM.md).
