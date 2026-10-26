import { expect, test } from '@playwright/test'

test('explicit Telegram request appears in New, has contact context and legacy prospects redirects', async ({ page, request }) => {
  const event = { requestId: 'e2e-telegram-001', payload: {
    company: 'Empresa Telegram E2E', ruc: '20998877002', contact: 'Ana Telegram', email: 'telegram@example.com',
    origin: 'Telegram', kind: 'advice', service: 'Asesoría certificaciones ISO',
    notes: 'Contacto Telegram: https://t.me/ana_prueba',
  } }
  for (const duplicate of [false, true]) {
    const response = await request.post('/api/crm/events', { headers: { 'X-CRM-Ingest-Key': 'e2e-integration-only' }, data: event })
    expect(await response.json()).toEqual({ accepted: true, duplicate })
  }
  await page.goto('/prospectos')
  await expect(page).toHaveURL(/\/negocios$/)
  await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: /Prospectos/ })).toHaveCount(0)
  await page.getByLabel('Filtrar por origen').selectOption('Telegram')
  await expect(page.locator('.deal-card').filter({ hasText: 'Empresa Telegram E2E' })).toHaveCount(1)
  await page.getByRole('link').filter({ hasText: 'Empresa Telegram E2E' }).click()
  await expect(page.getByLabel('Etapa del negocio')).toHaveValue('new')
  await expect(page.getByRole('region', { name: 'Solicitudes del cliente' })).toContainText('Telegram')
  await expect(page.getByRole('region', { name: 'Solicitudes del cliente' })).toContainText('https://t.me/ana_prueba')
  await expect(page.locator('.contact-block')).toContainText('telegram@example.com')
  await expect(page.locator('.aside-task')).toContainText('Realizar primera atención')
  const state = await (await request.get('/api/crm/state')).json()
  const revision = state.revision
  const response = await request.post('/api/crm/events', { headers: { 'X-CRM-Ingest-Key': 'e2e-integration-only' },
    data: { ...event, requestId: 'e2e-no-signals', payload: { ...event.payload, kind: 'signal' } } })
  expect(response.status()).toBe(422)
  expect((await (await request.get('/api/crm/state')).json()).revision).toBe(revision)
})
