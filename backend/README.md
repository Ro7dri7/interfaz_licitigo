# Lici backend (FastAPI + bot de Telegram)

API en Python que alimenta el frontend React y un bot de Telegram que avisa de nuevas licitaciones.
Lee las convocatorias SEACE (OECE, PROD2 y PROD6) de la base unificada en Supabase. El filtrado, la afinidad y la
paginación se calculan en la base con funciones SQL, así la página responde igual con 5 000 o 50 000 procesos.

```
backend/
  app/main.py           API HTTP (FastAPI)
  app/auth.py           Cuentas (Supabase Auth): registro, login, renovación y validación del token
  app/desbloqueos.py    Desbloqueo de licitaciones (5 por cuenta) + análisis ISO con IA vía n8n
  app/bot.py            Bot de Telegram + alertas periódicas
  app/empresa.py        Perfil por RUC: API MIGO (SUNAT) + ficha RNP del OECE
  app/licitaciones.py   Búsqueda paginada, afinidad por CIIU/CUBSO/keywords y keywords sugeridas
  app/suscripciones.py  Suscripciones de Telegram
```

## Puesta en marcha

1. **Entorno Python** (3.12+):

   ```bash
   cd backend
   python -m venv .venv
   .venv\Scripts\pip install -r requirements.txt
   ```

2. **Variables**: copia `.env.example` a `.env` y completa `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `APIMIGO_TOKEN`,
   `N8N_WEBHOOK_URL` y (si usas el bot) `TELEGRAM_BOT_TOKEN`.

3. **API** (puerto 8000; documentación interactiva en http://localhost:8000/docs):

   ```bash
   .venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
   ```

4. **Bot** (en otra terminal):

   ```bash
   .venv\Scripts\python -m app.bot
   ```

5. **Frontend**: en la raíz del repo, `npm run dev`. El proxy de Vite (`vite.config.ts`) manda `/api` al puerto 8000.

## Endpoints

Los marcados con 🔒 requieren `Authorization: Bearer <accessToken>` (el frontend lo agrega solo y renueva el token).

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/auth/registro` | Crea la cuenta (nombre, email, contraseña ≥ 8) ya confirmada y devuelve la sesión. |
| POST | `/api/auth/login` · `/api/auth/refresh` | Inicia sesión / renueva el access token. |
| GET 🔒 | `/api/perfil` | Usuario, RUC, keywords guardadas, ficha de la empresa y cupo de desbloqueos. |
| PUT 🔒 | `/api/perfil` | Guarda `ruc` y/o `keywords` (se limpian: mayúsculas, sin duplicados, máx. 30). |
| GET | `/api/empresas/{ruc}` | Ficha SUNAT (API MIGO) + RNP; la guarda en `proveedores`/`proveedor_ciiu`. |
| GET | `/api/terminos?ruc=…&ciius=…` | Keywords sugeridas para el RUC (ver abajo). |
| GET | `/api/keywords/conteo?keyword=…` | Licitaciones abiertas que calzan con una keyword escrita a mano. |
| GET 🔒 | `/api/licitaciones` | Licitaciones **abiertas** del perfil, 10 por página (`pagina`, `q`, `departamento`, `objeto`, `keyword`, `orden`, `solo_perfil`, `keywords`). |
| POST 🔒 | `/api/licitaciones/{id}/desbloquear` | Usa 1 de los 5 desbloqueos, muestra las bases y lanza el análisis n8n. |
| GET 🔒 | `/api/licitaciones/{id}/desbloqueo` | Bases, documentos, estado y resultado del análisis ISO con IA. |
| POST 🔒 | `/api/licitaciones/{id}/reanalizar` | Reintenta el análisis si falló (no gasta desbloqueos). |
| GET 🔒 | `/api/desbloqueos` | Licitaciones desbloqueadas por la cuenta. |
| GET | `/api/estadisticas` | Resumen de la base de datos. |
| GET · POST · DELETE 🔒 | `/api/alertas/telegram` | Estado de Telegram de la cuenta · enlace de un solo uso (24 h) con el RUC y keywords de la cuenta (`url`, `urlWeb`, `comando`) · desconectar. |

### Cómo se eligen las licitaciones

Solo se muestran convocatorias **abiertas**: `abierta = true`, fecha límite futura (si la tiene) y sin ganador
adjudicado ni documentos de la etapa de Buena Pro. Una convocatoria calza con la empresa si:

1. **CIIU + CUBSO**: alguno de sus ítems CUBSO pertenece a una actividad CIIU del RUC (o a su familia CUBSO, o la
   descripción corresponde a esa actividad) — tabla `convocatoria_ciiu`.
2. **Keywords**: la descripción o los ítems contienen todas las palabras distintivas de alguna keyword
   (`CEMENTO PORTLAND` calza con "cemento portland tipo I"; plurales incluidos).

La afinidad suma el tipo de coincidencia CIIU, las keywords que calzan, si el registro RNP cubre el objeto, si la
convocatoria es del **rubro de su historial** (mismo segmento CUBSO/UNSPSC que los procesos a los que ya postuló) y si
es en su departamento. Los CIIU **genéricos** ("venta al por mayor no especializada", "otros tipos de maquinaria", o
con más de 10 000 ítems CUBSO; tabla `ciiu_amplitud`) restan puntos, y más si están fuera del rubro del historial.
Se usan solo los CIIU oficiales de SUNAT (el flujo n8n agrega CIIU inferidos que no amplían la búsqueda).
Cada resultado trae sus `motivos`.

### Keywords sugeridas

Nombres de ítems CUBSO (sin medidas: `TUBO DE ACERO 1 1/4 in X 3 m` → `TUBO DE ACERO`) de las convocatorias del
rubro CIIU del RUC y de los procesos a los que la empresa ya postuló (★ "En tu historial", tabla `postulaciones`).
Primero van las que hoy tienen licitaciones abiertas, con este peso: abiertas × 3 si el CIIU es específico (× 1 si es
genérico) × 2 si es del rubro de su historial × 0,25 si viene de un CIIU genérico fuera de ese rubro. Después, solo
las del historial sin abiertas. Vienen marcadas las que tienen al menos una abierta; se evitan casi duplicados y el
usuario puede quitar o agregar keywords a mano.

### Desbloqueo y análisis con IA (n8n)

Cada cuenta tiene `perfiles.limite_desbloqueos` (5). El cupo se reserva en la base de forma atómica y volver a
desbloquear la misma licitación no gasta otro. Al desbloquear, el backend llama en segundo plano al webhook
`N8N_WEBHOOK_URL` del flujo "Analizador ISO Licitaciones" con `{ licitacion, ruc, perfil_id }`: el RUC es el que la
empresa registró en el onboarding. n8n lee las bases (PDF/ZIP/DOCX), detecta las ISO exigidas y genera la
recomendación para la empresa; el frontend consulta el estado hasta que termina. El flujo debe estar **activo** en
n8n para que funcione la URL de producción del webhook.

## Bot: comandos

`/start`, `/licitaciones`, `/nuevas`, `/buscar <texto>`, `/resumen`, `/keywords`, `/agregar <texto>`,
`/quitar <n>`, `/pausar`, `/reanudar`, `/ayuda`.

Cada `ALERT_INTERVAL_MIN` minutos el bot revisa la base de datos y avisa a cada chat de las licitaciones vigentes
nuevas que calzan con sus keywords o CIIU, sin repetir las ya enviadas.

## Pendiente

- **Análisis con IA:** poner en `N8N_WEBHOOK_URL` la URL de producción del webhook del flujo n8n y activarlo.
- **Bot de Telegram:** crear el bot en @BotFather y configurar `TELEGRAM_BOT_TOKEN`, probar las alertas con usuarios
  reales y desplegarlo en un servidor para que corra 24/7.
- **Frontend:** conectar la página "Mi equipo" (pipeline) al backend; hoy usa datos de ejemplo.
- **Capacidad máxima de contratación:** mostrarla solo a empresas con registro de Obras y usarla para marcar obras
  que la superen.
