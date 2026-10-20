import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const child = spawn(process.execPath, [vite, '--host', '127.0.0.1', ...process.argv.slice(2)], {
  env: { ...process.env, CRM_LOCAL_HTTPS: '1' }, stdio: 'inherit', windowsHide: true,
})
child.on('error', error => { console.error(`No se pudo iniciar HTTPS local: ${error.message}`); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
