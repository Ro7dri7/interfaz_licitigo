# ADR-001: piloto comercial separado, con reglas compartidas entre persistencias

Fecha: 2026-10-16. Estado: adoptado para desarrollo local; arquitectura de producción pendiente de normalización y validación remota.

## Contexto

El usuario autorizó comenzar el CRM con lo disponible y documentar lo pendiente. Lici vigente usa React/FastAPI/Supabase y tiene un bot Telegram. La carpeta del CRM contenía referencias visuales, sin aplicación. Necesitamos validar el flujo comercial sin migrar a ciegas las tablas reales de Lici ni hacer depender cada pantalla de integraciones aún no conectadas.

## Decisión

Aplicación React independiente en `lici-crm` con los tokens de `interfaz_licitigo`, API FastAPI y reglas comerciales puras. Una señal es una entrada distinta de una solicitud; el negocio solo se abre por solicitud explícita o confirmación del asesor. El contexto de licitación se conserva, y no acredita que falte una certificación.

Persistencia local JSON con reemplazo atómico para la demo y adaptador Supabase con un documento JSONB/revisión por espacio para un piloto acotado. Ambos pasan por los mismos comandos, validadores e idempotencia. No se plantea JSONB como esquema final de un CRM de gran volumen.

La autenticación comercial se verifica en servidor usando Supabase Auth y una membresía específica del CRM. Las tablas comerciales no se leen directamente con el rol authenticated. La sesión usa cookie HttpOnly/Secure; la clave privilegiada permanece en servidor.

## Alternativas y consecuencias

- Extender Angular: descartado por instrucción explícita; es la aplicación anterior.
- Incrustar toda la UI CRM en Lici: obligaría a acoplar las áreas cliente/comercial antes de definir permisos. Se reutiliza identidad y se prepara integración por eventos; empaquetar componentes compartidos queda para cuando ambas apps evolucionen juntas.
- Solo estado en memoria/localStorage: no permite comprobar reglas de servidor, integridad y conflictos. Se usa almacenamiento backend persistente y comprobable.
- Migración relacional completa inmediata: requiere confirmar roles, esquema existente y vínculos reales. Se aplaza de forma visible; el documento por espacio permite verificar primero un recorrido comercial coherente.

Costes aceptados solo para piloto: una lectura/copia completa del espacio por comando, búsqueda lineal y recibos que crecen; responsable textual, sin aislamiento por asesor. Normalizar entidades, hacer paginación, ID de actor, retención y permisos es requisito previo al crecimiento. No hay sincronización en tiempo real ni refresco de tokens. El acceso de clientes de Lici no se hereda.

## Criterios verificables de esta entrega

Señal aislada sin negocio; solicitud posterior vincula contexto y crea una sola oportunidad compatible; reintento no duplica; precio histórico no cambia; conflictos no pisan datos; contacto por teléfono compartido no se fusiona; dinero se redondea en céntimos; cierre y tareas conservan historial. Teclado, móvil, vacío y error tienen recorrido funcional. Ver comandos y evidencia en README y ESTADO.
