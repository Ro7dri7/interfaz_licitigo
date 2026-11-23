import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { comandos } from '../scripts/iniciar.mjs'

test('el arranque conjunto utiliza cada backend y excluye el bot', () => {
  const root = join(tmpdir(), 'LiciHub con espacios')
  const services = comandos('todo', root, {})
  assert.equal(services.length, 3)
  assert.equal(services[0].cwd, join(root, 'portal/backend'))
  assert.deepEqual(services[0].args.slice(0, 3), ['-m', 'uvicorn', 'app.main:app'])
  assert.equal(services[1].cwd, join(root, 'crm'))
  assert.equal(services[1].args[0], join(root, 'crm/scripts/api.mjs'))
  assert.equal(services[2].cwd, join(root, 'portal'))
  assert.equal(services[2].env.API_URL, 'http://127.0.0.1:8000')
  assert.equal(services[2].env.CRM_API_URL, 'http://127.0.0.1:8001')
  assert.equal(services[2].env.LICIHUB_UNIFIED, '1')
  assert.equal(services[2].env.VITE_CRM_BASE, '/comercial')
  assert.equal(services[2].args.includes('5174'), true)
  assert.equal(services.some(service => service.args.includes('app.bot')), false)
  assert.equal(services.some(service => String(service.args[0]).endsWith('start.mjs')), false)
})

test('el bot y el enlace de configuraciones apuntan al portal del mismo repositorio', () => {
  const root = join(tmpdir(), 'LiciHub con espacios')
  const bot = comandos('bot', root, {})[0]
  assert.deepEqual(bot.args, ['-m', 'app.bot'])
  assert.equal(bot.cwd, join(root, 'portal/backend'))
  const link = comandos('enlazar', root, {})[0]
  assert.equal(link.args.at(-1), join(root, 'crm'))
  assert.notEqual(bot.command, comandos('test-crm', root, {})[0].command)
  assert.throws(() => comandos('desconocido', root, {}), /Comando desconocido/)
})
