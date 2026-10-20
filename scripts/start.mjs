import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

const root = fileURLToPath(new URL('../', import.meta.url))

export function startupSettings(text, environment = process.env) {
  const file = parseEnv(text)
  const mode = environment.CRM_MODE ?? file.CRM_MODE ?? 'demo'
  const origin = environment.CRM_ORIGIN ?? file.CRM_ORIGIN ?? 'http://127.0.0.1:5174'
  const apiPort = environment.CRM_PORT ?? file.CRM_PORT ?? '8001'
  if (!['demo', 'supabase'].includes(mode)) throw new Error('CRM_MODE debe ser demo o supabase.')
  let url
  try { url = new URL(origin) } catch { throw new Error('CRM_ORIGIN no es una dirección válida. Ejemplo: https://127.0.0.1:5174') }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('El arranque local requiere CRM_ORIGIN con localhost o 127.0.0.1, sin ruta ni barra final. Ejemplo: https://127.0.0.1:5174')
  }
  if (mode === 'supabase' && url.protocol !== 'https:') throw new Error('Supabase requiere CRM_ORIGIN=https://127.0.0.1:5174 y abrir esa misma dirección con HTTPS.')
  const port = url.port || (url.protocol === 'https:' ? '443' : '80')
  if (!/^\d+$/.test(apiPort) || Number(apiPort) < 1 || Number(apiPort) > 65535 || Number(apiPort) === Number(port)) {
    throw new Error('CRM_PORT debe ser un puerto válido y distinto al del frontend; normalmente 8001.')
  }
  return { mode, origin, host: url.hostname, port, apiPort, https: url.protocol === 'https:' }
}

function availablePort(port, host) {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', () => reject(new Error(`No se puede usar ${host}:${port}. Detén la instancia anterior del CRM o revisa el puerto ocupado.`)))
    server.listen(Number(port), host, () => server.close(resolvePort))
  })
}

async function start() {
  const envFile = resolve(root, 'backend/.env')
  const config = startupSettings(existsSync(envFile) ? readFileSync(envFile, 'utf8') : '')
  const vite = resolve(root, 'node_modules/vite/bin/vite.js')
  if (!existsSync(vite)) throw new Error('Faltan dependencias del frontend. Ejecuta npm ci desde la carpeta que contiene package.json.')
  await availablePort(config.apiPort, '127.0.0.1')
  await availablePort(config.port, config.host)
  console.log(`LiciHub CRM · modo ${config.mode}\nAbre exactamente: ${config.origin}`)
  console.log(config.mode === 'demo' ? 'Demo local con datos ficticios y sin inicio de sesión.' : 'Supabase: usa una cuenta con membresía comercial activa. No intercambies localhost y 127.0.0.1.')
  if (config.https) console.log('HTTPS local utiliza un certificado autofirmado de desarrollo.')
  console.log('Ctrl+C detiene la API y el frontend.')
  const children = []
  let stopping = false
  const stop = code => {
    if (stopping) return
    stopping = true; process.exitCode = code
    for (const child of children.filter(item => item.pid && item.exitCode === null && item.signalCode === null)) {
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        killer.on('error', () => child.kill())
      } else child.kill('SIGTERM')
    }
  }
  const environment = { ...process.env, CRM_MODE: config.mode, CRM_ORIGIN: config.origin, CRM_PORT: config.apiPort }
  for (const [name, args, env] of [
    ['API', [resolve(root, 'scripts/api.mjs')], environment],
    ['Frontend', [vite, '--host', config.host, '--port', config.port, '--strictPort', '--clearScreen', 'false'],
      { ...environment, CRM_LOCAL_HTTPS: config.https ? '1' : '0', CRM_API_URL: `http://127.0.0.1:${config.apiPort}` }],
  ]) {
    const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true })
    children.push(child)
    child.on('error', error => { console.error(`${name}: ${error.message}`); stop(1) })
    child.on('exit', code => { if (!stopping) { console.error(`${name} terminó. Revisa el mensaje anterior.`); stop(code ?? 1) } })
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0))
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  start().catch(error => { console.error(`No se pudo iniciar LiciHub: ${error.message}`); process.exitCode = 1 })
}
