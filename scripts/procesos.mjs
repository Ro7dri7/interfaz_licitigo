import { spawn } from 'node:child_process'

// Detener también los descendientes evita dejar API o frontend ocupando sus puertos.
export function supervisar(servicios) {
  const children = []
  let stopping = false
  const stop = code => {
    if (stopping) return
    stopping = true
    process.exitCode = code
    for (const child of children.filter(item => item.pid && item.exitCode === null && item.signalCode === null)) {
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        killer.on('error', () => child.kill())
      } else child.kill('SIGTERM')
    }
  }
  for (const service of servicios) {
    const child = spawn(service.command, service.args, {
      cwd: service.cwd, env: service.env ?? process.env, stdio: 'inherit', windowsHide: true,
    })
    children.push(child)
    child.on('error', () => { console.error(`No se pudo iniciar ${service.name}. Ejecuta npm run instalar y revisa su configuración.`); stop(1) })
    child.on('exit', code => {
      if (!stopping) {
        if (code) console.error(`${service.name} terminó con error. Revisa el mensaje anterior.`)
        stop(code ?? 1)
      }
    })
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0))
  return stop
}
