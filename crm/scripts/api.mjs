import { existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const candidates = process.platform === 'win32'
  ? ['backend/.venv/Scripts/python.exe']
  : ['backend/.venv/bin/python']
const python = process.env.CRM_PYTHON || candidates.map(p => resolve(root, p)).find(existsSync) || 'python'
const dependencies = spawnSync(python, ['-c', 'import fastapi, uvicorn, httpx, pydantic_settings, email_validator'], { windowsHide: true, stdio: 'ignore' })
if (dependencies.status !== 0) {
  console.error('Falta Python o las dependencias de la API. Desde la carpeta que contiene package.json ejecuta:')
  console.error(process.platform === 'win32' ? 'python -m venv backend/.venv' : 'python3 -m venv backend/.venv')
  console.error(process.platform === 'win32'
    ? '& ".\\backend\\.venv\\Scripts\\python.exe" -m pip install -r backend/requirements.txt'
    : 'backend/.venv/bin/python -m pip install -r backend/requirements.txt')
  console.error('Después vuelve a ejecutar npm start. npm ci no instala las dependencias de Python.')
  process.exit(1)
}
const child = spawn(python, ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', process.env.CRM_PORT || '8001'], { cwd: root, stdio: 'inherit', windowsHide: true })
child.on('error', error => { console.error(`No se pudo iniciar Python: ${error.message}. Configura CRM_PYTHON o crea backend/.venv.`); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
