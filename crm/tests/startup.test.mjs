import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { startupSettings } from '../scripts/start.mjs'

test('missing local configuration starts a local demo with explicit ports', () => {
  assert.deepEqual(startupSettings('', {}), {
    mode: 'demo', origin: 'http://127.0.0.1:5174', host: '127.0.0.1', port: '5174', apiPort: '8001', https: false,
  })
})

test('Supabase startup keeps its configured HTTPS origin without returning secrets', () => {
  const settings = startupSettings('CRM_MODE=supabase\nCRM_ORIGIN="https://127.0.0.1:5174"\nCRM_SUPABASE_SECRET_KEY=test-only', {})
  assert.equal(settings.https, true)
  assert.equal(settings.origin, 'https://127.0.0.1:5174')
  assert.equal(JSON.stringify(settings).includes('test-only'), false)
})

test('explicit test environment overrides the local Supabase file', () => {
  const settings = startupSettings('CRM_MODE=supabase\nCRM_ORIGIN=https://127.0.0.1:5174', {
    CRM_MODE: 'demo', CRM_ORIGIN: 'http://127.0.0.1:5175', CRM_PORT: '8002',
  })
  assert.equal(settings.mode, 'demo')
  assert.equal(settings.port, '5175')
  assert.equal(settings.apiPort, '8002')
  assert.equal(settings.https, false)
})

test('invalid origins or API ports fail instead of weakening origin protection', () => {
  for (const origin of ['http://127.0.0.1:5174', 'https:http://127.0.0.1:5174', 'https://127.0.0.1:5174/', 'https://crm.example.com']) {
    assert.throws(() => startupSettings(`CRM_MODE=supabase\nCRM_ORIGIN=${origin}`, {}))
  }
  for (const port of ['0', '65536', '8001x', '5174']) {
    assert.throws(() => startupSettings('', { CRM_PORT: port }))
  }
})

test('API launcher explains how to install missing Python dependencies', () => {
  const directory = mkdtempSync(join(tmpdir(), 'licihub-python-test-'))
  try {
    const python = process.env.CRM_PYTHON || [
      'backend/.venv/Scripts/python.exe', 'backend/.venv/bin/python',
    ].map(p => resolve(p)).find(existsSync) || 'python'
    const created = spawnSync(python, ['-m', 'venv', '--without-pip', join(directory, '.venv')], { encoding: 'utf8', windowsHide: true })
    assert.equal(created.status, 0, created.stderr)
    const emptyPython = join(directory, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
    const result = spawnSync(process.execPath, ['scripts/api.mjs'], {
      env: { ...process.env, CRM_PYTHON: emptyPython }, encoding: 'utf8', windowsHide: true,
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /requirements\.txt/)
    assert.match(result.stderr, /venv backend\/\.venv/)
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    rmSync(directory, { recursive: true, force: true })
  }
})
