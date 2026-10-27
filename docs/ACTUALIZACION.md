# Pasar de las dos copias anteriores al repositorio único

Desde el 27/10/2026, `main` contiene `portal/` y `crm/`. Ya no se descarga una rama diferente para cada aplicación. El historial del CRM queda integrado como padre de la incorporación, junto al historial del portal.

## Instalaciones existentes del equipo

La opción recomendada para esta transición es clonar `main` en una carpeta nueva, al lado de las anteriores. Así se conserva la configuración, cualquier trabajo propio y las colas locales hasta comprobar la nueva instalación.

1. Detener API, interfaces y bot con `Ctrl+C`. Acordar quién ejecutará el único bot del equipo.
2. Revisar `git status --short` en las copias anteriores. Conservar cualquier cambio propio y trasladarlo mediante una revisión de Git antes de retirar esas copias. No hacer `reset --hard` ni borrar carpetas.
3. Desde el directorio que contendrá el proyecto, ejecutar por separado:

```powershell
git clone --branch main --single-branch https://github.com/Ro7dri7/interfaz_licitigo.git licihub
```

```powershell
cd licihub
```

4. Antes de instalar, copiar con el explorador los archivos indicados a sus destinos nuevos. Nunca intercambiar los dos `.env`. Si un destino ya tiene configuración o datos, respaldarlo y compararlo; no sobrescribirlo automáticamente.

| Origen anterior | Destino en la nueva carpeta `licihub` |
| --- | --- |
| Portal: `backend/.env` | `portal/backend/.env` |
| CRM: `backend/.env` | `crm/backend/.env` |
| Portal: carpeta `backend/data` | `portal/backend/data` |
| CRM: carpeta `backend/data` | `crm/backend/data` |

La carpeta de datos del portal puede contener `asesorias.sqlite3`, con solicitudes pendientes. Con todos los procesos detenidos, copiar la carpeta completa, incluidos los archivos SQLite `-wal`/`-shm` si existen. La demo local del CRM también debe copiarse completa si se necesita conservarla. Estos archivos contienen información local y no deben subirse a Git.

Si `CRM_OUTBOX_FILE` o `CRM_DATA_FILE` apuntan a rutas absolutas antiguas, actualizar las rutas a los nuevos archivos conservados. Si no están configuradas, los programas utilizan su nueva carpeta `backend/data`. No ejecutar en paralelo los procesos antiguos y nuevos sobre copias de una misma cola.

Supabase conserva los registros compartidos en el servidor: no hay que copiarlos, volver a importar el catálogo ni crear otro espacio. La cola SQLite sí pertenece a la computadora que recibió la solicitud y no se obtiene con `git pull`.

5. No copiar `.venv`, `node_modules` ni certificados: se regeneran en las nuevas rutas. Ejecutar:

```powershell
npm run instalar
```

6. Revisar la configuración privada. Para datos reales del CRM, conservar `CRM_MODE=supabase`, origen HTTPS, proyecto y UUID de espacio. Para enlazar la recepción local:

```powershell
npm run enlazar
```

7. Encender:

```powershell
npm start
```

8. Desde otra terminal en la misma raíz, comprobar la recepción:

```powershell
npm run diagnostico
```

Este diagnóstico no crea un negocio ni prueba guardados en Supabase. Comprobar el login del portal, el acceso al espacio CRM y los registros existentes. El encargado puede iniciar `npm run bot` y completar una solicitud de asesoría real autorizada; verificar su procedencia en Negocios.

9. Si quedaron solicitudes pendientes, desde `portal/backend` en la instalación que conserva la cola original:

```powershell
.\.venv\Scripts\python.exe -m app.asesorias reintentar-pendientes
```

## Copias anteriores de main actualizadas con git pull

El código del portal pasa de la raíz a `portal/`. Los archivos ignorados antiguos (`backend/.env`, `backend/data`, `.venv`, `node_modules`) no se trasladan mediante Git. Tras actualizar, copiar manualmente la configuración y los datos a los destinos de la tabla anterior, con los servicios detenidos y sin sobrescribir destinos existentes. Crear los entornos con `npm run instalar` y utilizar los nuevos comandos desde la raíz.

Las copias de la antigua rama exclusiva del CRM deben migrar a la nueva copia de `main` con el procedimiento anterior. No hacer pull de `main` sobre esa rama para intentar fusionar dos estructuras distintas en cada computadora.

## Actualizaciones posteriores

Desde la nueva raíz: `git pull --ff-only origin main`, después `npm run instalar`. Mantener las credenciales fuera de Git y reiniciar las aplicaciones. Todos los componentes se actualizan juntos.

## Recuperación

Las carpetas anteriores se conservan durante la transición. Si falla la nueva instalación, detenerla antes de volver a usar la anterior. Si la cola nueva ya recibió solicitudes, conservar también sus datos; no volver a una copia anterior de SQLite ni mezclar archivos de bases distintas. Para recuperar código en el repositorio, revertir cambios mediante Git conservando el historial; las bases y archivos privados requieren su propio respaldo.
