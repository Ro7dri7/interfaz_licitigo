import { defineConfig } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', fullyParallel: false, workers: 1, retries: 0,
  use: { baseURL: 'http://127.0.0.1:5175', channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node scripts/api.mjs', url: 'http://127.0.0.1:8002/api/crm/session', reuseExistingServer: false,
      env: { CRM_MODE: 'demo', CRM_PORT: '8002', CRM_ORIGIN: 'http://127.0.0.1:5175', CRM_DATA_FILE: join(tmpdir(), `lici-crm-e2e-${randomUUID()}.sqlite3`), CRM_INGEST_KEY: '' } },
    { command: 'npm run dev -- --port 5175', url: 'http://127.0.0.1:5175', reuseExistingServer: false,
      env: { CRM_API_URL: 'http://127.0.0.1:8002' } },
  ],
})
