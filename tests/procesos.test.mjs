import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const supervisor = new URL('../scripts/procesos.mjs', import.meta.url).href

for (const failure of [false, true]) {
  test(failure ? 'un servicio fallido detiene sus compañeros y propaga el error' : 'la parada del supervisor detiene sus servicios', { timeout: 15000 }, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'licihub procesos '))
    const marker = join(directory, 'child.pid')
    const worker = `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, String(process.pid)); setInterval(() => {}, 1000)`
    const descriptor = { name: 'Servicio de prueba', command: process.execPath, args: ['--input-type=module', '-e', worker], cwd: directory }
    const fail = `import { existsSync } from 'node:fs'; const interval=setInterval(() => { if (existsSync(${JSON.stringify(marker)})) { clearInterval(interval); process.exit(7) } }, 20)`
    const program = `import { supervisar } from ${JSON.stringify(supervisor)};
      import { existsSync } from 'node:fs';
      const stop=supervisar(${JSON.stringify(failure ? [descriptor, { ...descriptor, args: ['--input-type=module', '-e', fail] }] : [descriptor])});
      ${failure ? '' : `const interval=setInterval(() => { if (existsSync(${JSON.stringify(marker)})) { clearInterval(interval); stop(0) } }, 20);`}`
    const parent = spawn(process.execPath, ['--input-type=module', '-e', program], { stdio: 'ignore', windowsHide: true })
    try {
      const exit = await new Promise((accept, reject) => {
        const timer=setTimeout(() => reject(new Error('El supervisor no terminó')), 10000)
        parent.once('error', error => { clearTimeout(timer); reject(error) })
        parent.once('exit', code => { clearTimeout(timer); accept(code) })
      })
      assert.equal(exit, failure ? 7 : 0)
      assert.equal(existsSync(marker), true)
      const pid = Number(readFileSync(marker, 'utf8'))
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    } finally {
      for (const pid of [parent.pid, existsSync(marker) ? Number(readFileSync(marker, 'utf8')) : null].filter(Boolean)) {
        try {
          if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
          else process.kill(pid, 'SIGTERM')
        } catch { /* El proceso ya terminó. */ }
      }
      assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
      rmSync(directory, { recursive: true, force: true })
    }
  })
}

test('un ejecutable inexistente produce un error controlado y cierra el conjunto', { timeout: 5000 }, async () => {
  const program = `import { supervisar } from ${JSON.stringify(supervisor)}; supervisar([{name:'Ausente', command:'licihub-ejecutable-inexistente', args:[], cwd:${JSON.stringify(fileURLToPath(new URL('../', import.meta.url)))}}]);`
  const child=spawn(process.execPath, ['--input-type=module', '-e', program], { stdio: 'ignore', windowsHide: true })
  const code=await new Promise((accept,reject) => { child.once('exit',accept); child.once('error',reject) })
  assert.equal(code,1)
})
