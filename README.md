# LiciHub CRM

Actualización 26/10/2026: el flujo vigente centraliza solicitudes explícitas en Negocios y retira Prospectos del menú. Portal y Telegram tienen confirmación y cola de entrega. Aplicar manualmente SQL 008 para el origen Telegram. Supabase ya devuelve versión 2 y 540 productos ISO. [Flujo y activación](docs/ASESORIA_PORTAL_TELEGRAM.md). Las referencias anteriores a señales o 006/007 pendientes corresponden a versiones previas.

**Actualización 19/10/2026:** la marca visible del CRM y del Portal Clientes React es LiciHub. Se revisaron los videos y el CRM/Bandeja de referencia; [flujos, requisitos y propuesta 360dialog/n8n](docs/LICIHUB_FLUJOS_Y_REQUISITOS.md). Las integraciones descritas en ese documento son próximas entregas; los directorios y el identificador técnico de origen `Lici` se conservan.

Primera entrega funcional del CRM comercial complementario a **Lici React** (`../interfaz_licitigo`). React 19, TypeScript 6, Vite 8, Tailwind CSS 4 y FastAPI. Identidad compartida a partir de los tokens del proyecto vigente; no usa la aplicación anterior Angular.

**Estado al 20 de octubre de 2026:** el usuario aplicó el SQL y proporcionó el espacio. Configuración local Supabase creada fuera de Git y lectura real verificada: espacio vacío, revisión 0. HTTPS local disponible; el servidor registró inicio de sesión y lectura autenticada correctos. Falta comprobar el primer guardado comercial y los distintos roles con cuentas reales. La demo SQLite anterior se conserva. [Configuración y activación](docs/SUPABASE_RELACIONAL.md); alcance completo en [docs/ESTADO.md](docs/ESTADO.md). Las integraciones de captación y mensajería siguen pendientes.

El SQL vigente usa nombres en español (`empresas`, `negocios`, `cotizaciones`, `espacio_id`). Si ya se ejecutó la versión en inglés, la guía incluye una transición que conserva los datos. Ejecutar los scripts prepara la base; usar datos reales requiere además configurar Supabase, habilitar miembros y verificar el acceso HTTPS.

**Ampliación de cotizaciones (20/10):** varias partidas/paquetes, IGV incluido por defecto, envío/aceptación/rechazo registrados y documento comercial de INTERCERT; catálogo ISO del Excel (540 referencias, 165 paquetes) y dos responsables ficticios. Para activarlo en el espacio Supabase actual faltan **006 y 007**, en ese orden; [instrucciones y flujo comercial](docs/COTIZACIONES.md). No se aplicaron estas migraciones remotas desde el desarrollo.

## Instalación para el equipo

Repositorio privado: [Favianlc/licihub-crm](https://github.com/Favianlc/licihub-crm). [Guía para clonar, instalar, configurar Supabase y trabajar en equipo](docs/INSTALACION_EQUIPO.md). El CRM funciona por separado del portal. Cada integrante necesita acceso al repositorio y su propia configuración local; las migraciones compartidas se ejecutan una sola vez.

## Arrancar en este equipo

Desde la carpeta donde se clonó `licihub-crm`, con las dependencias instaladas y `backend/.env` configurado:

```powershell
npm start
```

Este comando inicia API y frontend juntos y muestra la dirección exacta configurada en `CRM_ORIGIN`, sin intercambiar `localhost` y `127.0.0.1`. Usa HTTPS para Supabase y HTTP para la demo predeterminada. Detener instancias anteriores antes de arrancar; `Ctrl+C` detiene ambos servicios. Como alternativa manual siguen disponibles `npm run api` y `npm run dev:https` (Supabase) o `npm run dev` (demo HTTP).

El lanzador de API prefiere `backend/.venv`, después reutiliza el Python ya disponible en `../interfaz_licitigo/backend/.venv` en Windows. También admite `CRM_PYTHON` como ruta absoluta al ejecutable. No cambia las dependencias de Lici.

En una instalación nueva, requiere Node 24 LTS, Python 3.12+ y:

```powershell
npm ci
py -m venv backend/.venv
& '.\backend\.venv\Scripts\python.exe' -m pip install -r backend/requirements.txt
```

Abrir **https://127.0.0.1:5174**. El certificado es autofirmado para desarrollo: el navegador puede mostrar una advertencia al abrir esa dirección local. No se instaló una autoridad de confianza en Windows. Para una demo sin Supabase, usar `CRM_MODE=demo`, `CRM_ORIGIN=http://127.0.0.1:5174` y `npm run dev`.

Para configurar valores propios, copiar `backend/.env.example` a `backend/.env`. La demo funciona sin archivo `.env`. Usar exactamente el origen configurado; el frontend reenvía `/api` a la API HTTP restringida a loopback. No hay que configurar CORS. La clave de servidor permanece en el backend y no se carga desde Vite.

El modo demo no pide contraseña y solo admite acceso local. Usa `backend/data/demo.sqlite3`: si existe el antiguo `demo.json`, lo importa una sola vez y conserva el original intacto. Recargar o reiniciar conserva los cambios en tablas. Usar **un único proceso de API** sobre esa demo. Para respaldarla, detener la API y copiar SQLite junto con sus archivos `-wal`/`-shm` si existen; el JSON conservado no incluye cambios posteriores. Para comenzar otra demo, asignar un archivo SQLite nuevo con `CRM_DATA_FILE`. No ingresar datos reales en esta demo ni publicarla a través de un proxy.

**Directorio (21/10):** Empresas y Contactos comparten una sola entrada de navegación, con pestañas y ficha de empresa que reúne personas, negocios y cotizaciones. Conserva enlaces antiguos y datos existentes; no requiere SQL adicional. [Funcionamiento del directorio](docs/DIRECTORIO.md).

## Recorrido disponible

1. El cliente confirma **Hablar con un asesor** desde una licitación desbloqueada o `/asesor` desde Telegram. Desbloquear por sí solo no envía datos comerciales.
2. La solicitud abre o vincula un negocio compatible en **Negocios → Nuevo**, con contacto, origen y tarea inicial. Se puede registrar una petición recibida por otro canal con **Nuevo negocio**.
3. La ficha conserva cada solicitud y su procedencia, incluso si portal y Telegram se vinculan al mismo negocio. **Directorio** reúne las empresas y sus contactos.
4. En **Negocios**, usar tablero o lista y abrir la ficha. Registrar actividades, programar tareas y cambiar la etapa desde el selector.
5. **Cotizar** combina hasta 50 certificaciones/paquetes, con cantidades, descuento, IGV incluido editable, vigencia y condiciones. Conserva versiones y permite imprimir/guardar el documento de INTERCERT como PDF. El asesor registra envío, aceptación o rechazo con evidencia; estas acciones no envían comunicaciones externas.
6. **Ganado** exige un importe positivo cotizado. **Perdido** exige motivo. Ambos registran historial; no equivalen a cobro ni entrega.

## Verificación

```powershell
npm run build
npm run lint
npm run test:startup
& '.\backend\.venv\Scripts\python.exe' -m unittest discover -s backend -t .
npm run test:db
npm run test:e2e
```

Las pruebas usan el entorno propio `backend/.venv`. Las pruebas de navegador requieren Google Chrome instalado. Playwright levanta servicios independientes en **5175/8002**, con datos ficticios nuevos en un archivo temporal del sistema; no modifica la demo de 5174. Esos puertos deben estar libres. Los resultados y trazas de fallos quedan en `test-results/`, excluido de Git.

Última validación: build y lint correctos; **45 pruebas Python, 15 pruebas PostgreSQL, 5 pruebas de arranque y 8 recorridos Playwright aprobados**. PostgreSQL se verifica con PGlite y un esquema mínimo de portal/Auth, sin Docker; el adaptador HTTP usa dobles controlados. No equivale a validar Supabase Auth remoto. Inspección visual previa en escritorio 1440 px y móvil 375 px, ficha y propuesta imprimible. El entorno Python compartido emite una advertencia de deprecación de TestClient/httpx; no impide las pruebas y no se alteró el entorno de Lici.

## Organización

- `src/`: rutas, formularios, vistas y cliente API. `brand.css` conserva los tokens de Lici; `styles.css` define el CRM.
- `backend/domain.py`: reglas comerciales puras y validación, importes en céntimos.
- `backend/main.py`: API, autenticación y autorización del espacio comercial.
- `backend/relational.py`: demo SQLite e importación no destructiva del JSON anterior.
- `backend/relational_codec.py`: transformación entre el contrato de interfaz y filas por entidad.
- `backend/repository.py`: adaptador Supabase por funciones transaccionales y control de revisión.
- `backend/migrations/002_relational_tables.sql`, `003_relational_api.sql`: modelo relacional inicial aplicado por el usuario. 006 amplía cotizaciones y 007 carga el catálogo ISO; ambos pendientes de ejecución manual. `001_crm.sql` es histórico y no debe ejecutarse.
- `docs/SUPABASE_RELACIONAL.md`: SQL, creación de espacio/administrador y comprobación de conexión.
- `docs/INTEGRACIONES.md`: activación y contrato de eventos.
- `docs/decisions/002-modelo-relacional-compartido.md`: decisión vigente de persistencia y límites.
- `tasks/plan.md`, `tasks/todo.md`: alcance original y avance verificable.

No se almacenan contraseñas, tokens del bot ni claves de servicio en el repositorio o en variables `VITE_*`. La configuración de producción requiere un despliegue HTTPS del frontend y la API bajo el mismo origen; `vite preview` solo sirve para revisar el build local.
