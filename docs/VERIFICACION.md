# Verificación de la estructura unificada

Fecha: 27/10/2026. Windows, Node 24.20.0 y Python 3.14.7; entornos creados en las rutas nuevas mediante `npm run instalar`.

| Comprobación | Resultado |
| --- | --- |
| Archivos trasladados a `portal/` | Mismos blobs y modos que la versión anterior |
| Archivos incorporados a `crm/` | Mismos blobs y modos que la rama integrada |
| `npm test` | 5 pruebas aprobadas, incluyendo procesos reales, parada y propagación de fallos |
| `npm run test:portal` | 23 pruebas aprobadas |
| `npm run test:crm` | 53 pruebas aprobadas |
| `npm run test:integracion` | Asesoría confirmada, teléfono, cola persistente, recuperación y deduplicación correctos |
| `npm --prefix crm run test:startup` | 5 pruebas aprobadas |
| `npm --prefix crm run test:db` | 16 pruebas PostgreSQL embebido aprobadas |
| `npm --prefix crm run test:e2e` | 9 recorridos Chrome aprobados |
| `npm run build` | Ambas interfaces compilan |
| `npm run lint` | Sin errores; advertencia previa de Fast Refresh en `portal/src/context/OnboardingContext.tsx:105` |
| Análisis estático de scripts/pruebas de la raíz | Sin hallazgos |
| `npm start` | Inicia las dos API y las dos interfaces; no inicia Telegram |
| Portal y proxy `/api/health` | HTTP 200; configuración de base y recepción disponibles |
| CRM por HTTPS y sesión sin credenciales | HTTP 200 y HTTP 401 respectivamente, conforme a la autenticación |
| `npm run diagnostico` | `recepcion_habilitada`, sin crear negocios |
| `Ctrl+C` | Libera los puertos 5173, 5174, 8000 y 8001 |

Los tests Python muestran una advertencia de deprecación de Starlette/httpx ya presente; no se alteraron las pruebas para ocultarla. El arranque de Playwright puede registrar un rechazo de conexión mientras espera que termine de iniciar la API; los nueve recorridos finalizaron correctamente.

Se conservaron localmente los archivos privados y se respaldaron las bases SQLite mediante la API de backup, sin modificar las copias anteriores. No se ejecutaron migraciones en Supabase, no se enviaron mensajes a Telegram ni se creó un negocio comercial real durante esta comprobación. Las pruebas de integración y navegador utilizan datos temporales.

La prueba real del bot requiere una sola instancia alojada por el integrante encargado. Las solicitudes pendientes en otras computadoras deben recuperarse desde sus colas originales, conforme a [la guía de actualización](ACTUALIZACION.md).
