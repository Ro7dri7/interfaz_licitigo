import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { supervisar } from './procesos.mjs'

export const root = fileURLToPath(new URL('../', import.meta.url))

export function comandos(target, directory = root, environment = process.env) {
  const portal = join(directory, 'portal'), crm = join(directory, 'crm')
  const python = component => environment[component === 'portal' ? 'PORTAL_PYTHON' : 'CRM_PYTHON'] ||
    join(directory, component, 'backend', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  const node = (name, cwd, args, env = environment) => ({ name, cwd, command: process.execPath, args, env })
  const py = (name, component, args, cwd = join(directory, component, 'backend')) =>
    ({ name, cwd, command: python(component), args, env: environment })
  const api = () => py('API del portal', 'portal', ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'])
  const frontend = () => node('Interfaz del portal', portal,
    [join(portal, 'node_modules/vite/bin/vite.js'), '--host', 'localhost', '--port', '5173', '--strictPort', '--clearScreen', 'false'],
    { ...environment, API_URL: 'http://127.0.0.1:8000' })
  const comercial = () => node('CRM', crm, [join(crm, 'scripts/start.mjs')])
  switch (target) {
    case 'todo': return [api(), frontend(), comercial()]
    case 'portal': return [api(), frontend()]
    case 'crm': return [comercial()]
    case 'bot': return [py('Bot de Telegram', 'portal', ['-m', 'app.bot'])]
    case 'enlazar': return [py('Configuración comercial', 'portal', ['-m', 'app.configurar_crm', '--crm', crm])]
    case 'diagnostico': return [py('Diagnóstico comercial', 'portal', ['-m', 'app.asesorias', 'diagnostico'])]
    case 'test-portal': return [py('Pruebas del portal', 'portal', ['-m', 'unittest', 'discover', '-s', 'tests'])]
    case 'test-crm': return [py('Pruebas del CRM', 'crm', ['-m', 'unittest', 'discover', '-s', 'backend', '-t', '.'], crm)]
    case 'test-integracion': return [py('Prueba portal y CRM', 'portal', [join(portal, 'scripts/probar_integracion_crm.py'), '--crm-path', crm], portal)]
    default: throw new Error('Comando desconocido. Usa npm start, npm run portal, npm run crm o npm run bot.')
  }
}

function iniciar() {
  const target = process.argv[2] ?? 'todo'
  const services = comandos(target)
  for (const service of services) {
    if (!existsSync(service.command)) throw new Error('Falta el entorno Python. Ejecuta npm run instalar desde la raíz.')
    if (service.command === process.execPath && !existsSync(service.args[0])) {
      throw new Error('Faltan dependencias del frontend. Ejecuta npm run instalar desde la raíz.')
    }
  }
  if (['todo', 'portal', 'bot', 'enlazar', 'diagnostico'].includes(target) && !existsSync(join(root, 'portal/backend/.env'))) {
    throw new Error('Falta portal/backend/.env. Ejecuta npm run instalar y completa SUPABASE_URL, SUPABASE_SECRET_KEY y APIMIGO_TOKEN.')
  }
  if (target === 'bot') console.log('Telegram: mantener una sola instancia por token en todo el equipo.')
  if (['todo', 'portal'].includes(target)) console.log('Portal: http://localhost:5173 · API: http://127.0.0.1:8000')
  if (['todo', 'portal', 'crm', 'bot'].includes(target)) console.log('Ctrl+C detiene los servicios de este comando. El bot se inicia por separado con npm run bot.')
  supervisar(services)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { iniciar() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
