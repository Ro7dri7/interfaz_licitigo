import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const candidates = process.platform === 'win32'
  ? ['backend/.venv/Scripts/python.exe', '../interfaz_licitigo/backend/.venv/Scripts/python.exe']
  : ['backend/.venv/bin/python']
const python = process.env.CRM_PYTHON || candidates.map(p => resolve(p)).find(existsSync) || 'python'
const child = spawn(python, ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', process.env.CRM_PORT || '8001'], { stdio: 'inherit', windowsHide: true })
child.on('error', error => { console.error(`No se pudo iniciar Python: ${error.message}. Configura CRM_PYTHON o crea backend/.venv.`); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
