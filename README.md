# Lici

Plataforma de inteligencia para contrataciones del Estado peruano (SEACE): valida la empresa por RUC, sugiere los
términos más licitados de su rubro, lista las licitaciones vigentes que le calzan y avisa por Telegram cuando sale
una nueva.

📘 Documentación completa del sistema (arquitectura, flujo, recomendación, n8n, API, tablas): [docs/DOCUMENTACION.md](docs/DOCUMENTACION.md)

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS 4 |
| Backend | Python + FastAPI (`backend/`) |
| Base de datos | Supabase (PostgreSQL) |
| Datos por RUC | API MIGO (SUNAT) + ficha RNP del OECE |
| Análisis ISO con IA | Flujo n8n + Google Gemini (`n8n/`) |
| Alertas | Bot de Telegram (`python-telegram-bot`) |

## Cómo correrlo

Requisitos: Node 20+, Python 3.12+.

1. **Frontend**

   ```bash
   npm install
   npm run dev
   ```

   Abre http://localhost:5173/. Las llamadas a `/api` se redirigen al backend (ver `vite.config.ts`).

2. **Backend** — ver [backend/README.md](backend/README.md) para crear el entorno y el `.env`. Luego, desde la raíz:

   ```bash
   backend\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000 --app-dir backend
   ```

3. **Bot de Telegram** (opcional, en otra terminal):

   ```bash
   cd backend
   .venv\Scripts\python -m app.bot
   ```

## Pantallas

- **Ingresar**: registro e inicio de sesión (Supabase Auth a través del backend).
- **Onboarding**: ingreso de RUC con datos reales de SUNAT/RNP, términos más licitados del rubro como keywords
  sugeridas y elección del canal de alertas.
- **Descubrimiento**: licitaciones vigentes filtradas por keywords/CIIU, con afinidad, fecha de cierre y desbloqueo
  (bases + análisis ISO con IA, 5 por cuenta).
- **Mis desbloqueos**: licitaciones desbloqueadas con sus bases y la recomendación de la IA.
- **Mi perfil**: cuenta, empresa, actividades CIIU, keywords, cupo, historial en el SEACE y alertas por Telegram.
- **Mi equipo**: pipeline de seguimiento (hoy con datos de ejemplo).

## Pendiente

- Bot de Telegram: configurar el token, pruebas con usuarios reales y despliegue 24/7.
- Página "Mi equipo" conectada al backend (hoy usa datos de ejemplo).

## Otros comandos

```bash
npm run build   # build de producción en dist/
npm run lint    # oxlint
```
