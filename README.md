# Lici CRM

Primera entrega funcional del CRM comercial complementario a **Lici React** (`../interfaz_licitigo`). React 19, TypeScript 6, Vite 8, Tailwind CSS 4 y FastAPI. Identidad compartida a partir de los tokens del proyecto vigente; no usa la aplicación anterior Angular.

**Estado al 16 de octubre de 2026:** funciona localmente con datos ficticios persistentes. Adaptador Supabase y receptor de eventos preparados; no se aplicó la migración, no se conectó el bot ni se modificó la base de Lici. Alcance completo y pendientes en [docs/ESTADO.md](docs/ESTADO.md).

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

El modo demo no pide contraseña y solo admite acceso local. Usa ejemplos generados una sola vez en `backend/data/demo.json`. Recargar o reiniciar conserva los cambios. Usar **un único proceso de API** sobre ese archivo. Para conservar una sesión de pruebas, detener la API y copiar el JSON como respaldo; para comenzar otra, asignar un archivo nuevo con `CRM_DATA_FILE`. No ingresar datos reales en esta demo ni publicarla a través de un proxy.

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
npm run test:e2e
```

Si se creó el entorno propio, reemplazar la ruta Python por `backend/.venv/Scripts/python.exe`. Las pruebas de navegador requieren Google Chrome instalado. Playwright levanta servicios independientes en **5175/8002**, con datos ficticios nuevos en un archivo temporal del sistema; no modifica la demo de 5174. Esos puertos deben estar libres. Los resultados y trazas de fallos quedan en `test-results/`, excluido de Git.

Última validación: build y lint sin errores ni advertencias; **20 pruebas Python y 4 recorridos Playwright aprobados**. Inspección visual en escritorio 1440 px y móvil 375 px, ficha y propuesta imprimible. Las pruebas Supabase usan dobles controlados, no una base remota. El entorno Python compartido emite una advertencia de deprecación de TestClient/httpx; no impide las pruebas y no se alteró el entorno de Lici.

## Organización

- `src/`: rutas, formularios, vistas y cliente API. `brand.css` conserva los tokens de Lici; `styles.css` define el CRM.
- `backend/domain.py`: reglas comerciales puras y validación, importes en céntimos.
- `backend/main.py`: API, autenticación y autorización del espacio comercial.
- `backend/repository.py`: persistencia local atómica o Supabase con control de revisión.
- `backend/migrations/001_crm.sql`: migración aditiva preparada, **no aplicada**.
- `docs/INTEGRACIONES.md`: activación y contrato de eventos.
- `docs/decisions/001-piloto-comercial.md`: decisiones y límites de arquitectura.
- `tasks/plan.md`, `tasks/todo.md`: alcance original y avance verificable.

No se almacenan contraseñas, tokens del bot ni claves de servicio en el repositorio o en variables `VITE_*`. La configuración de producción requiere un despliegue HTTPS del frontend y la API bajo el mismo origen; `vite preview` solo sirve para revisar el build local.
