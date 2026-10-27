import { spawnSync } from 'node:child_process'
import { constants, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { root } from './iniciar.mjs'

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true })
  if (result.error || result.status !== 0) throw new Error('La instalación se detuvo. Corrige el error anterior y vuelve a ejecutar npm run instalar.')
}

try {
  const npm = process.env.npm_execpath
  if (!npm) throw new Error('Ejecuta este instalador mediante npm run instalar.')
  const candidates = process.platform === 'win32' ? [['py', ['-3']], ['python', []]] : [['python3', []]]
  const selected = candidates.find(([command, args]) => spawnSync(command,
    [...args, '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)'],
    { stdio: 'ignore', windowsHide: true }).status === 0)
  if (!selected) throw new Error('Instala Python 3.12 o posterior y vuelve a abrir la terminal.')
  for (const component of ['portal', 'crm']) {
    const cwd = join(root, component), backend = join(cwd, 'backend')
    console.log(`Instalando dependencias de ${component}...`)
    run(process.execPath, [npm, 'ci'], cwd)
    const env = join(backend, '.env')
    if (!existsSync(env)) copyFileSync(join(backend, '.env.example'), env, constants.COPYFILE_EXCL)
    const python = join(backend, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
    if (!existsSync(python)) run(selected[0], [...selected[1], '-m', 'venv', join(backend, '.venv')], backend)
    run(python, ['-m', 'pip', 'install', '-r', 'requirements.txt'], backend)
  }
  console.log('Dependencias listas. Completa portal/backend/.env y crm/backend/.env; después ejecuta npm run enlazar y npm start. No se sobrescribieron archivos .env existentes.')
} catch (error) { console.error(error.message); process.exitCode = 1 }
