import { expect, test } from '@playwright/test'
import type { Snapshot } from '../src/types'
import { money } from '../src/types'

test('unified directory opens the company, its contacts, businesses and quotations without changing data', async ({ page, request }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  let snapshot: Snapshot = await (await request.get('/api/crm/state')).json()
  const command = async (operation: string, payload: unknown) => {
    const response = await request.post('/api/crm/commands', { headers: { Origin: 'http://127.0.0.1:5175' }, data: {
      revision: snapshot.revision, requestId: crypto.randomUUID(), operation, payload,
    } })
    expect(response.ok()).toBe(true)
    snapshot = await response.json()
  }
  const name = 'Directorio Integrado E2E'
  await command('intake', { company: name, ruc: '20997710001', contact: 'Ana Directorio', email: 'ana.directorio@example.com',
    kind: 'quote', service: 'ISO 9001', owner: 'Lucía Mendoza (prueba)' })
  await command('intake', { company: name, ruc: '20997710001', contact: 'Bruno Directorio', email: 'bruno.directorio@example.com',
    kind: 'advice', service: 'ISO 14001', owner: 'Diego Salazar (prueba)' })
  await command('intake', { company: 'Empresa Aislada Directorio', ruc: '20997710002', contact: 'Persona Ajena', kind: 'quote', service: 'ISO 45001' })
  const company = snapshot.data.companies.find(c => c.name === name)!
  const deal = snapshot.data.deals.find(d => d.companyId === company.id && d.service === 'ISO 9001')!
  await command('quote', { dealId: deal.id, items: [{ productId: snapshot.data.products[0].id, quantity: 1 }],
    tax: '18', validUntil: '2099-12-31', terms: 'Condiciones ficticias de prueba.' })
  await command('quote', { dealId: deal.id, items: [{ productId: snapshot.data.products[0].id, quantity: 2 }],
    tax: '18', validUntil: '2099-12-31', terms: 'Nueva versión ficticia de prueba.' })
  const before = snapshot
  const quote = snapshot.data.quotes.filter(q => q.dealId === deal.id).at(-1)!
  await page.goto('/directorio?q=Directorio%20Integrado')
  const navigation = page.getByRole('navigation', { name: 'Navegación principal' })
  await expect(navigation.getByRole('link', { name: 'Directorio', exact: true })).toHaveCount(1)
  await expect(navigation.getByRole('link', { name: /^(Empresas|Contactos)$/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Directorio', exact: true })).toBeVisible()
  const tabs = page.getByRole('navigation', { name: 'Vistas del directorio' })
  await expect(tabs.getByRole('link', { name: /Empresas/ })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('directorio-empresas-desktop.png'), fullPage: true })
  await page.getByRole('link', { name, exact: true }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Contactos de la empresa' }).locator('tbody tr')).toHaveCount(2)
  await expect(page.getByRole('region', { name: 'Negocios de la empresa' }).locator('tbody tr')).toHaveCount(2)
  await expect(page.getByRole('region', { name: 'Cotizaciones de la empresa' }).locator('tbody tr')).toHaveCount(2)
  await expect(page.locator('.company-summary')).toContainText(money(quote.total))
  await expect(page.locator('main')).not.toContainText('Persona Ajena')
  await page.screenshot({ path: testInfo.outputPath('ficha-empresa-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: quote.number, exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(quote.number)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: quote.number, exact: true })).toBeFocused()
  await page.setViewportSize({ width: 375, height: 812 })
  await page.evaluate(() => window.scrollTo(0, 0))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('ficha-empresa-mobile.png'), fullPage: true })
  await page.getByRole('link', { name: 'Volver al directorio' }).click()
  await expect(page.getByRole('searchbox', { name: 'Buscar registros' })).toHaveValue('Directorio Integrado')
  await tabs.getByRole('link', { name: /Contactos/ }).click()
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await page.getByRole('searchbox', { name: 'Buscar registros' }).fill('Bruno Directorio')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('directorio-contactos-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: 'Limpiar filtros' }).click()
  await expect(tabs.getByRole('link', { name: /Contactos/ })).toHaveAttribute('aria-current', 'page')
  const after: Snapshot = await (await request.get('/api/crm/state')).json()
  expect(after).toEqual(before)
  expect(errors).toEqual([])
})

test('old directory URLs retain filters, and empty or unknown company has a recovery path', async ({ page, request }) => {
  const snapshot: Snapshot = await (await request.get('/api/crm/state')).json()
  const contact = snapshot.data.contacts[0]
  await page.goto(`/contactos?empresa=${contact.companyId}&q=${encodeURIComponent(contact.email)}`)
  await expect(page).toHaveURL(/\/directorio\?/)
  await expect(page.getByRole('navigation', { name: 'Vistas del directorio' }).getByRole('link', { name: /Contactos/ })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('tbody')).toContainText(contact.name)
  await page.goto(`/empresas?empresa=${contact.companyId}`)
  await expect(page).toHaveURL(/\/directorio\?/)
  await expect(page.locator('tbody tr')).toHaveCount(1)
  const company = snapshot.data.companies.find(c => c.id === contact.companyId)!
  await page.getByRole('link', { name: company.name, exact: true }).click()
  const deal = snapshot.data.deals.find(d => d.companyId === company.id)!
  await page.getByRole('region', { name: 'Negocios de la empresa' }).getByRole('link', { name: deal.service, exact: true }).click()
  await page.locator('.breadcrumb').getByRole('link', { name: company.name, exact: true }).click()
  await expect(page.getByRole('heading', { name: company.name, exact: true })).toBeVisible()
  const response = await request.post('/api/crm/commands', { headers: { Origin: 'http://127.0.0.1:5175' }, data: {
    revision: snapshot.revision, requestId: crypto.randomUUID(), operation: 'intake',
    payload: { company: 'Empresa Sin Relaciones E2E', kind: 'manual', service: 'ISO 9001' },
  } })
  expect(response.ok()).toBe(true)
  const next: Snapshot = await response.json()
  const empty = next.data.companies.find(c => c.name === 'Empresa Sin Relaciones E2E')!
  await page.goto(`/directorio/empresas/${empty.id}`)
  for (const title of ['Sin contactos registrados', 'Sin negocios registrados', 'Sin cotizaciones registradas']) {
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  }
  await page.goto('/directorio/empresas/no-existe')
  await expect(page.getByRole('heading', { name: 'Empresa no encontrada' })).toBeVisible()
  await page.getByRole('link', { name: 'Volver al directorio' }).click()
  await expect(page.getByRole('heading', { name: 'Directorio', exact: true })).toBeVisible()
})
