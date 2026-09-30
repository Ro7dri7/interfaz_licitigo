# Flujos n8n

| Archivo | Flujo | Webhook |
|---|---|---|
| `analizador-iso-licitaciones.json` | **Analizador ISO Licitaciones**: descarga las bases de la licitación, detecta con Gemini las ISO que exigen y genera la recomendación para la empresa. Lo llama el backend al **desbloquear** una licitación. | `POST /webhook/desbloquear-licitacion-gemini` |
| `registrar-empresa.json` | **Registrar Empresa (Perfil RUC)**: consulta SUNAT + RNP y guarda el perfil en Supabase. Alternativa a `GET /api/empresas/{ruc}` del backend. | `POST /webhook/registrar-empresa` |

## Importar

1. En n8n: menú **⋯ → Import from file** y elige el `.json`.
2. **Pon la secret key de Supabase** (ambos flujos): en el nodo **Config Supabase**, campo **`supabaseKey`**, reemplaza
   `PEGA_AQUI_LA_SECRET_KEY_DE_SUPABASE` por la secret key del proyecto (`supabaseUrl` ya apunta a la base del equipo).
   Igual que la de Gemini, **no la subas al repositorio**.
3. **Pon tu API key de Gemini** (solo el Analizador ISO):
   - Abre el nodo **Config Supabase**.
   - En el campo **`geminiApiKey`** reemplaza `PON_AQUI_TU_API_KEY_DE_GEMINI` por tu propia key.
   - La key se crea gratis en [Google AI Studio](https://aistudio.google.com/apikey) (tiene capa gratuita con
     límites; pasado el límite se cobra por uso a la cuenta dueña de la key).
   - Los nodos **Iniciar Subida Gemini**, **Analizar con Gemini** y **Generar Recomendación Final** la leen de ahí;
     no hay que tocarlos.
   - **No subas tu key al repositorio**: si exportas el flujo de nuevo, vuelve a dejar el marcador.
4. **Actívalo** con el interruptor *Inactive → Active* (o *Publish*). Sin eso la URL de producción responde 404.
5. Copia la **Production URL** del nodo **Webhook Desbloqueo** y ponla en `backend/.env`:

   ```
   N8N_WEBHOOK_URL=https://TU-N8N/webhook/desbloquear-licitacion-gemini
   ```

   Si varias personas importan el flujo en el mismo n8n, solo uno puede estar activo con esa ruta.

## Qué recibe y qué responde el Analizador ISO

Petición (la envía el backend):

```json
{ "licitacion": "LP-ABR-7-2026-UZCUSCO-2", "ruc": "20557084364", "perfil_id": "uuid-de-la-cuenta" }
```

Respuesta: `status` (`processed`, `cached`, `too_large`, `not_supported`, `not_found`), `requiere_iso`,
`resultado_iso`, `recomendacion` (`recomendacion`, `encaje_actividad`, `brechas`, `iso_recomendadas`, `resumen`),
`recomendacion_texto`, `perfil_proveedor`, `licitaciones_recomendadas`.

Escribe en Supabase: `convocatorias.requiere_iso`, `analisis_empresa_licitacion` y el perfil de la empresa
(`proveedores`, `proveedor_ciiu`).

Prueba rápida sin gastar Gemini (licitación inexistente, debe responder `not_found`):

```bash
curl -X POST https://TU-N8N/webhook/desbloquear-licitacion-gemini -H "Content-Type: application/json" -d "{\"licitacion\":\"NO-EXISTE\"}"
```

Más detalle en [docs/DOCUMENTACION.md](../docs/DOCUMENTACION.md#6-desbloqueo-e-integración-con-n8n).
