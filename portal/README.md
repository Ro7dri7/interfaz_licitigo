# LiciHub · Portal Clientes

El portal y su bot viven en `portal/`, dentro del mismo repositorio que `crm/`. Todo se descarga y actualiza desde `main`. [Instalación y comandos desde la raíz](../README.md) · [Migración de copias anteriores](../docs/ACTUALIZACION.md).

Desde la raíz del repositorio, `npm run portal` inicia esta API y su interfaz. `npm start` inicia además el CRM. El encargado del único bot ejecuta `npm run bot` por separado. Cada aplicación conserva su propio `.env` y entorno Python.

El CRM complementario está en `../crm`. Una licitación desbloqueada permite **Hablar con un asesor** y el bot incorpora `/asesor`, ambos con confirmación y entrega persistente al CRM. Solo las solicitudes explícitas crean negocios. [Activación, límites y pruebas](docs/ASESORIAS_CRM.md).

Plataforma de inteligencia para contrataciones del Estado peruano (SEACE): valida la empresa por RUC, sugiere los
términos más licitados de su rubro, lista las licitaciones vigentes que le calzan y avisa por Telegram cuando sale
una nueva.

Documentación completa del sistema (arquitectura, flujo, recomendación, n8n, API, tablas): [docs/DOCUMENTACION.md](docs/DOCUMENTACION.md)

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

Requisitos: Node 24+, Python 3.12+. Los comandos manuales siguientes se ejecutan desde `portal/`, no desde la raíz general.

1. **Frontend**

   ```bash
   npm ci
   npm run dev
   ```

   Abre http://localhost:5173/. Las llamadas a `/api` se redirigen al backend (ver `vite.config.ts`).

2. **Backend** — ver [backend/README.md](backend/README.md) para crear el entorno y el `.env`. Luego, desde `portal/`:

   ```bash
   .\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000 --app-dir backend
   ```

3. **Bot de Telegram** (opcional, en otra terminal):

   ```bash
   cd backend
   .\.venv\Scripts\python.exe -m app.bot
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
