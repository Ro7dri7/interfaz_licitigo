# LiciHub CRM

**Actualización 19/10/2026:** la marca visible del CRM y del Portal Clientes React es LiciHub. Se revisaron los videos y el CRM/Bandeja de referencia; [flujos, requisitos y propuesta 360dialog/n8n](docs/LICIHUB_FLUJOS_Y_REQUISITOS.md). Las integraciones descritas en ese documento son próximas entregas; los directorios y el identificador técnico de origen `Lici` se conservan.

Primera entrega funcional del CRM comercial complementario a **Lici React** (`../interfaz_licitigo`). React 19, TypeScript 6, Vite 8, Tailwind CSS 4 y FastAPI. Identidad compartida a partir de los tokens del proyecto vigente; no usa la aplicación anterior Angular.

**Estado al 19 de octubre de 2026:** funciona localmente con tablas SQLite y conserva la demo anterior. Modelo relacional y adaptador Supabase preparados y probados; el usuario ejecutará el SQL. [Orden de archivos y activación](docs/SUPABASE_RELACIONAL.md). No se aplicaron cambios remotos ni se conectó mensajería. Alcance completo y pendientes en [docs/ESTADO.md](docs/ESTADO.md).

El SQL vigente usa nombres en español (`empresas`, `negocios`, `cotizaciones`, `espacio_id`). Si ya se ejecutó la versión en inglés, la guía incluye una transición que conserva los datos. Ejecutar los scripts prepara la base; usar datos reales requiere además configurar Supabase, habilitar miembros y verificar el acceso HTTPS.

## Arrancar en este equipo

Desde `C:\Users\Favian\Downloads\testeos\lici-crm`, abrir dos terminales:

```powershell
# Terminal 1: API en http://127.0.0.1:8001
npm run api
```

```powershell
# Terminal 2: interfaz en http://127.0.0.1:5174
npm run dev
```

El lanzador de API prefiere `backend/.venv`, después reutiliza el Python ya disponible en `../interfaz_licitigo/backend/.venv` en Windows. También admite `CRM_PYTHON` como ruta absoluta al ejecutable. No cambia las dependencias de Lici.

En una instalación nueva, requiere Node 24 LTS, Python 3.12+ y:

```powershell
npm ci
py -m venv backend/.venv
& '.\backend\.venv\Scripts\python.exe' -m pip install -r backend/requirements.txt
```

Para configurar valores propios, copiar `backend/.env.example` a `backend/.env`. El modo local funciona sin archivo `.env`. Abrir **127.0.0.1**, no `localhost`, para mantener el origen configurado en los guardados. El frontend reenvía `/api` a la API; no hay que configurar CORS.

El modo demo no pide contraseña y solo admite acceso local. Usa `backend/data/demo.sqlite3`: si existe el antiguo `demo.json`, lo importa una sola vez y conserva el original intacto. Recargar o reiniciar conserva los cambios en tablas. Usar **un único proceso de API** sobre esa demo. Para respaldarla, detener la API y copiar SQLite junto con sus archivos `-wal`/`-shm` si existen; el JSON conservado no incluye cambios posteriores. Para comenzar otra demo, asignar un archivo SQLite nuevo con `CRM_DATA_FILE`. No ingresar datos reales en esta demo ni publicarla a través de un proxy.

## Recorrido disponible

1. En **Prospectos**, registrar empresa, contacto, origen, responsable y servicio. Un RUC exacto vincula la empresa; sin RUC se crea un registro independiente.
2. Elegir **Señal Lici** para guardar un requisito/recomendación sin generar una venta. Seleccionar **Asesoría solicitada** o **Cotización solicitada** abre un negocio o vincula uno abierto para la misma empresa/servicio.
3. Una señal se convierte al confirmar interés desde su ficha. Si ya hay negocio abierto compatible, las nuevas señales se vinculan como contexto conservando su naturaleza.
4. En **Negocios**, usar tablero o lista y abrir la ficha. Registrar actividades, programar tareas y cambiar la etapa desde el selector.
5. **Cotizar** prepara un borrador de un servicio del catálogo, con cantidad, descuento, impuesto editable, vigencia y condiciones. Conserva versiones y permite imprimir/guardar PDF desde el navegador.
6. **Ganado** exige un importe positivo cotizado. **Perdido** exige motivo. Ambos registran historial; no equivalen a cobro ni entrega.

## Verificación

```powershell
npm run build
npm run lint
& '..\interfaz_licitigo\backend\.venv\Scripts\python.exe' -m unittest discover -s backend -t .
npm run test:db
npm run test:e2e
```

Si se creó el entorno propio, reemplazar la ruta Python por `backend/.venv/Scripts/python.exe`. Las pruebas de navegador requieren Google Chrome instalado. Playwright levanta servicios independientes en **5175/8002**, con datos ficticios nuevos en un archivo temporal del sistema; no modifica la demo de 5174. Esos puertos deben estar libres. Los resultados y trazas de fallos quedan en `test-results/`, excluido de Git.

Última validación: build y lint correctos; **30 pruebas Python, 12 pruebas PostgreSQL y 4 recorridos Playwright aprobados**. PostgreSQL se verifica con PGlite y un esquema mínimo de portal/Auth, sin Docker; el adaptador HTTP usa dobles controlados. No equivale a validar Supabase Auth remoto. Inspección visual previa en escritorio 1440 px y móvil 375 px, ficha y propuesta imprimible. El entorno Python compartido emite una advertencia de deprecación de TestClient/httpx; no impide las pruebas y no se alteró el entorno de Lici.

## Organización

- `src/`: rutas, formularios, vistas y cliente API. `brand.css` conserva los tokens de Lici; `styles.css` define el CRM.
- `backend/domain.py`: reglas comerciales puras y validación, importes en céntimos.
- `backend/main.py`: API, autenticación y autorización del espacio comercial.
- `backend/relational.py`: demo SQLite e importación no destructiva del JSON anterior.
- `backend/relational_codec.py`: transformación entre el contrato de interfaz y filas por entidad.
- `backend/repository.py`: adaptador Supabase por funciones transaccionales y control de revisión.
- `backend/migrations/002_relational_tables.sql`, `003_relational_api.sql`: modelo relacional y acceso de servidor, **no aplicados remotamente**. `001_crm.sql` es histórico y no debe ejecutarse.
- `docs/SUPABASE_RELACIONAL.md`: SQL, creación de espacio/administrador y comprobación de conexión.
- `docs/INTEGRACIONES.md`: activación y contrato de eventos.
- `docs/decisions/002-modelo-relacional-compartido.md`: decisión vigente de persistencia y límites.
- `tasks/plan.md`, `tasks/todo.md`: alcance original y avance verificable.

No se almacenan contraseñas, tokens del bot ni claves de servicio en el repositorio o en variables `VITE_*`. La configuración de producción requiere un despliegue HTTPS del frontend y la API bajo el mismo origen; `vite preview` solo sirve para revisar el build local.
