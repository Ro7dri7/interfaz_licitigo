# LiciHub CRM

El CRM vive en `crm/`, junto a `portal/`, y todo se descarga desde `main`. [Instalación y arranque desde la raíz](../README.md) · [Migrar las copias anteriores](../docs/ACTUALIZACION.md).

React 19, TypeScript 6, Vite 8, Tailwind CSS 4 y FastAPI; diseño compartido con el portal. Negocios recibe solicitudes explícitas y confirmadas desde el portal y Telegram. Directorio organiza empresas y contactos; Agenda y Mi día reúnen los seguimientos. El catálogo contiene certificaciones ISO y paquetes, con precios incluidos y cotizaciones comerciales de varias partidas. [Flujo y activación](docs/ASESORIA_PORTAL_TELEGRAM.md).

## Arranque

Desde la raíz del repositorio, con dependencias y configuración listas:

```powershell
npm run crm
```

`npm start` desde la raíz inicia además el portal; el bot tiene un comando separado. Desde esta carpeta `crm/`, el comando `npm start` sigue iniciando solamente el CRM.

La API utiliza `crm/backend/.venv` o el ejecutable indicado por `CRM_PYTHON`. La configuración está en `crm/backend/.env`. En modo Supabase usar `CRM_ORIGIN=https://127.0.0.1:5174` y abrir exactamente esa dirección; la plantilla de demostración utiliza HTTP y datos ficticios locales. El arranque muestra el modo y la URL. `Ctrl+C` detiene API y frontend.

Supabase mantiene los registros del espacio compartido. La reorganización no requiere SQL nuevo ni volver a provisionar el espacio. El usuario confirmó SQL 008 para el origen Telegram. [Esquema y membresías](docs/SUPABASE_RELACIONAL.md).

El modo demo utiliza `backend/data/demo.sqlite3` de esta aplicación. Mantener un solo proceso sobre esa base. Conservar la carpeta de datos al migrar instalaciones; no copiar entornos Python ni dependencias entre rutas.

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

Validación de la reorganización (27/10/2026): build y lint correctos; **53 pruebas Python, 16 pruebas PostgreSQL, 5 pruebas de arranque y 9 recorridos Playwright aprobados**. PostgreSQL se verifica con PGlite y un esquema mínimo de portal/Auth, sin Docker; el adaptador HTTP usa dobles controlados. No equivale a validar Supabase Auth remoto. Cada aplicación utiliza su propio entorno Python. [Comprobación conjunta](../docs/VERIFICACION.md).

## Organización

- `src/`: rutas, formularios, vistas y cliente API. `brand.css` conserva los tokens de Lici; `styles.css` define el CRM.
- `backend/domain.py`: reglas comerciales puras y validación, importes en céntimos.
- `backend/main.py`: API, autenticación y autorización del espacio comercial.
- `backend/relational.py`: demo SQLite e importación no destructiva del JSON anterior.
- `backend/relational_codec.py`: transformación entre el contrato de interfaz y filas por entidad.
- `backend/repository.py`: adaptador Supabase por funciones transaccionales y control de revisión.
- `backend/migrations/002_relational_tables.sql`, `003_relational_api.sql`: modelo relacional inicial aplicado por el usuario. 006 amplía cotizaciones y 007 carga el catálogo ISO; aplicados previamente en el proyecto compartido. `001_crm.sql` es histórico y no debe ejecutarse.
- `docs/SUPABASE_RELACIONAL.md`: SQL, creación de espacio/administrador y comprobación de conexión.
- `docs/INTEGRACIONES.md`: activación y contrato de eventos.
- `docs/decisions/002-modelo-relacional-compartido.md`: decisión vigente de persistencia y límites.
- `tasks/plan.md`, `tasks/todo.md`: alcance original y avance verificable.

No se almacenan contraseñas, tokens del bot ni claves de servicio en el repositorio o en variables `VITE_*`. La configuración de producción requiere un despliegue HTTPS del frontend y la API bajo el mismo origen; `vite preview` solo sirve para revisar el build local.
