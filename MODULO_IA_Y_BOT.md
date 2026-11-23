# Módulo de IA y bot de Telegram

Informe de arquitectura. Describe el analizador ISO y los dos bots de Telegram. No incluye claves, tokens, contraseñas ni datos de proxy.

## 1. Analizador ISO

El análisis de una licitación desbloqueada no corre dentro de React ni de FastAPI. FastAPI reserva el cupo, llama un webhook de n8n y guarda la respuesta. n8n descarga las bases, las lee con Gemini y consulta el perfil de la empresa.

### Piezas

| Pieza | Rol |
|---|---|
| Portal React | Muestra el estado del desbloqueo y el veredicto en la ficha. |
| FastAPI (`desbloqueos.py`) | Reserva el cupo, llama al webhook y guarda el JSON en `desbloqueos.resultado`. |
| n8n | Orquesta descarga, Gemini, RNP, SUNAT/MIGO y la escritura en Supabase. |
| Gemini | Lee las bases y redacta el veredicto para esa empresa. El modelo configurado es `gemini-3.5-flash-lite`. |
| Supabase | Guarda convocatorias, el texto ISO, el análisis por empresa y el perfil del proveedor. |
| OECE (RNP) | Ficha del proveedor y resumen de ubicación. |
| API MIGO | Códigos CIIU de SUNAT en tiempo real. |
| Proxy de salida | Descarga el PDF, ZIP o DOCX de las bases cuando el origen bloquea la IP del servidor. |

El webhook de producción es `POST /webhook/desbloquear-licitacion-gemini`. El flujo tiene que estar activo. La URL de prueba solo responde mientras el editor de n8n está escuchando.

### Contrato con el portal

FastAPI envía:

```json
{ "licitacion": "<nomenclatura_norm>", "ruc": "<ruc de 11 dígitos>", "perfil_id": "<uuid de la cuenta>" }
```

`licitacion` sale de `convocatorias.nomenclatura_norm`. Si ese campo viene vacío, el portal manda el código `licitacion`. n8n busca solo por `nomenclatura_norm`.

n8n usa los tres campos. El RUC del cuerpo tiene prioridad sobre el RUC guardado en `perfiles`. `perfil_id` se copia a `analisis_empresa_licitacion.solicitado_por` cuando es un UUID.

La respuesta que el portal acepta como análisis listo trae `status` en `processed` o `cached`, más:

- `requiere_iso`: texto con las líneas `ESTADO`, `NORMAS SOLICITADAS`, `MODALIDAD` y `RESUMEN`.
- `recomendacion`: objeto con `recomendacion`, `encaje_actividad`, `brechas`, `resumen`, `iso_recomendadas`, `pack_disponible` y `mensaje_comercial`.

Otros estados, y el portal no los trata como error de servidor:

| `status` | Significado en pantalla |
|---|---|
| `too_large` | El archivo supera 60 MB. |
| `not_supported` | El archivo no es PDF, ZIP con bases o DOCX. |
| `not_found` | No hay convocatoria con esa nomenclatura. |

El portal espera hasta 300 segundos. La ficha consulta el estado cada pocos segundos.

### Recorrido del flujo

1. Busca la convocatoria por `nomenclatura_norm`.
2. Si `requiere_iso` ya contiene el bloque de recomendación (`CÓMO OBTENERLA`), reutiliza ese texto y no vuelve a leer el archivo.
3. Si no hay caché, arma la URL de las bases, mide el archivo y lo descarga a través del proxy.
4. PDF de menos de 15 MB viaja en línea. Uno mayor se sube a la API de archivos de Gemini. Un ZIP se abre para elegir las bases. Un DOCX se reduce al texto de `document.xml`.
5. Gemini responde qué normas piden las bases. El texto se normaliza al formato `ESTADO` / `NORMAS` / `MODALIDAD` / `RESUMEN`.
6. Con RUC válido, el flujo consulta la ficha RNP, el resumen OECE y los CIIU de MIGO. Guarda el perfil con la RPC `guardar_perfil_empresa`.
7. Una segunda llamada a Gemini redacta el veredicto solo con normas del catálogo de la empresa: Postular, Postular con reservas o No recomendado.
8. Actualiza `convocatorias.requiere_iso` y hace upsert en `analisis_empresa_licitacion`.
9. Responde al webhook. Sin RUC válido responde solo el análisis ISO, con `recomendacion` nula.

Las llamadas a Supabase van con la clave de servidor en el encabezado `apikey`. Con una clave `sb_secret` no se envía `Authorization: Bearer`. MIGO sí usa su propio encabezado de autorización. Gemini recibe la clave como parámetro de la URL, leída desde la configuración del flujo y no escrita en el repositorio.

### Qué pinta la ficha

`DetalleDesbloqueo.tsx` muestra, cuando el estado es `listo`:

- veredicto
- resumen
- requisitos ISO de las bases (estado, modalidad, normas, resumen)
- encaje con la actividad
- brechas
- ISO recomendadas (norma, alcance, motivo) y el pack, si viene
- mensaje comercial, si viene

Esa pantalla sale de `desbloqueos.resultado`. Si la llamada HTTP se pierde y n8n ya guardó la fila, el portal la recupera de `analisis_empresa_licitacion` por `ruc` y `convocatoria_id`, y lee `recomendacion`, `encaje`, `brechas`, `iso_recomendadas` y `texto`.

La restricción única documentada de esa tabla es `(ruc, convocatoria_id)`. El flujo versionado en `portal/n8n/analizador-iso-licitaciones.json` hace el upsert con esa pareja e incluye `convocatoria_id`.

### Ajuste del export revisado

El archivo `Analizador ISO Licitaciones.json` de Descargas es una variante anterior del flujo del repositorio:

- El upsert usa `on_conflict=ruc,nomenclatura_norm` y no envía `convocatoria_id`. Con la restricción actual, esa escritura falla. El nodo sigue adelante, así que la ficha puede pintarse con la respuesta HTTP, y la recuperación por `convocatoria_id` queda vacía.
- La clave de Gemini está escrita en las URLs de los nodos. En el flujo del repositorio se lee de la configuración.
- Le faltan el paso de licitaciones abiertas relacionadas y los campos `recomendacion_texto` y `licitaciones_recomendadas`. La ficha actual no los muestra.
- El export está inactivo.

Para que funcione a la primera se importa el JSON de `portal/n8n/`, se quita `Authorization: Bearer` en los nodos de Supabase, se coloca la clave de Gemini en la configuración, se activa el flujo y se copia la URL de producción en `N8N_WEBHOOK_URL`. `desbloqueos.py` ya envía `licitacion`, `ruc` y `perfil_id`. No hace falta cambiarlo para este contrato.

## 2. Chatbot de Telegram

Hay dos bots distintos. Comparten el mismo extremo del CRM y no comparten proceso, base ni conversación.

### Bot académico (`bot_licihub`)

Es una demo conversacional. La persona escribe por Telegram sin tener cuenta en el portal. n8n recibe el mensaje y llama una API FastAPI local. Esa API lleva la sesión, busca licitaciones, arma el expediente y, al confirmar, deja el lead en una cola.

SQLite guarda el estado de la demo, no el CRM:

| Tabla | Uso |
|---|---|
| `sesiones` | Estado del chat (Telegram o WhatsApp) y borrador. |
| `eventos_entrada` | Updates ya vistos, para no procesar dos veces el mismo mensaje. |
| `solicitudes` y `solicitudes_iso` | Expediente confirmado: licitación, RUC, empleados, norma, contacto y consentimiento. |
| `derivaciones` | Intento de entrega al CRM, con clave de idempotencia. |
| `outbox` | Cola con reintentos (30 s, 2 min, 10 min, 30 min, 1 h; máximo 10). |

Dependencias de la API: Python 3.11–3.14, FastAPI, Uvicorn y jsonschema. Las pruebas usan pytest y httpx. El router conversacional es JavaScript dentro de n8n. Telegram entra por el nodo de n8n, no por una librería de Python.

La búsqueda lee Supabase público: la RPC `buscar_licitaciones`, `proveedor_ciiu` y `convocatorias`. No escribe `licihub_crm`.

El lead sale por `POST {API del CRM}/api/crm/events` con el encabezado `X-CRM-Ingest-Key` y este cuerpo:

```json
{ "requestId": "n8n:<id de la solicitud>", "payload": { "company": "", "ruc": "", "contact": "", "email": "", "phone": "", "origin": "Telegram", "kind": "advice", "service": "", "evidence": "none", "tender": "", "notes": "" } }
```

`origin` puede ser `Telegram` o `WhatsApp`. `kind` es `advice`, o `quote` si se mostraron productos del catálogo. Esos valores coinciden con el `Intake` del CRM. El cliente HTTP de ese bot envía `Authorization: Bearer` junto con `apikey` en todas las lecturas de Supabase. Con una clave `sb_secret` esas lecturas fallan; la clave nueva va solo en `apikey`.

El propio README deja el flujo de asesor desactivado, el ensayo integral sin cerrar y la disponibilidad atada al PC, a n8n en el VPS y a un túnel temporal. Los JSON de `workflows/` son exports de preparación, inactivos.

### Bot del repositorio (`npm run bot`)

Es el bot de una cuenta que ya existe en el portal. `/start` vincula el chat con `telegram_suscripciones`. El RUC es el del perfil. Cada cierto intervalo avisa licitaciones nuevas que calzan con las palabras clave.

Comandos de uso: licitaciones, nuevas, buscar, resumen, keywords, pausar y reanudar. La asesoría pide el motivo y un teléfono, muestra un resumen y solo entonces entra a la misma cola del portal hacia `POST /api/crm/events`, con `origin` `Telegram`.

Corre con `python-telegram-bot` dentro de `portal/backend`. Lee y escribe Supabase con el cliente del portal, que manda `Authorization` solo cuando la clave es un JWT. La cola de reintentos de asesorías es un SQLite aparte, en el portal.

### Veredicto para la exposición

La opción estable esta semana es el bot del repositorio (`npm run bot`). Ya está conectado al login, a las suscripciones y al CRM de este proyecto. Un solo proceso, sin túnel.

Correr el bot académico tal cual agrega una segunda API, un SQLite privado, n8n y un túnel. Su README todavía no da por cerrado el envío al asesor, y su cliente de Supabase no está alineado con la clave `sb_secret`.

Pasar esa conversación a n8n es el diseño de largo plazo de esa demo. Esta semana implica publicar workflows, cerrar el ensayo y volver a probar el contrato del CRM. No es el camino para la exposición del domingo.
