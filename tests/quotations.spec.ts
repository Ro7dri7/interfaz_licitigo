import { expect, test } from '@playwright/test'
import type { Product, Snapshot } from '../src/types'

test('ISO catalog, multiple included-tax lines, status history and distinct directories', async ({ page, request }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/catalogo')
  await page.getByRole('button', { name: /Importar catálogo ISO/ }).click()
  await expect(page.getByRole('button', { name: 'Catálogo ISO cargado' })).toBeDisabled()
  let snapshot: Snapshot = await (await request.get('/api/crm/state')).json()
  expect(snapshot.data.products.filter(p => p.sku)).toHaveLength(540)
  const iso = snapshot.data.products.find(p => p.name === 'ISO 9001:2015 - Certificacion Inicial Micro Empresa (Virtual)')!
  const pack = snapshot.data.products.find((p: Product) => p.isPackage && p.category === 'initial' && p.name.includes('Micro Empresa') && p.name.includes('(Virtual)'))!
  expect(iso.price).toBe(444000)
  const companyName = 'Empresa Cotización Integrada E2E', ruc = '20998877001'
  const intake = await request.post('/api/crm/commands', { headers: { Origin: 'http://127.0.0.1:5175' }, data: {
    revision: snapshot.revision, requestId: 'quote-e2e-company', operation: 'intake', payload: {
      company: companyName, ruc, contact: 'Ana Comercial', email: 'ana@example.com', kind: 'quote',
      service: 'Certificación integrada', owner: 'Lucía Mendoza (prueba)', origin: 'Referido',
    },
  } })
  expect(intake.ok()).toBe(true)
  snapshot = await intake.json()
  const company = snapshot.data.companies.find(c => c.name === companyName)!
  const deal = snapshot.data.deals.find(d => d.companyId === company.id)!
  await page.goto(`/negocios/${deal.id}`)
  await page.getByRole('button', { name: 'Cotizar', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Servicio de la partida 1').selectOption(iso.id)
  await dialog.getByRole('button', { name: 'Añadir certificación o servicio' }).click()
  await dialog.getByLabel('Servicio de la partida 2').selectOption(pack.id)
  await expect(dialog.getByLabel('Los precios incluyen IGV / impuesto')).toBeChecked()
  await dialog.getByLabel('Válida hasta').fill('2099-12-31')
  await dialog.getByLabel('Condiciones comerciales y de pago').fill('Condiciones ficticias de prueba acordadas para esta propuesta.')
  await dialog.getByRole('button', { name: 'Guardar borrador' }).click()
  await expect(dialog).not.toBeVisible()
  snapshot = await (await request.get('/api/crm/state')).json()
  const quote = snapshot.data.quotes.find(q => q.dealId === deal.id)!
  expect(quote.items).toHaveLength(2)
  expect(quote.total).toBe(iso.price + pack.price)
  expect(quote.taxIncluded).toBe(true)
  await page.locator('.quote-mini').click()
  await expect(dialog).toContainText('INTERCERT LATAM S.A.C.')
  await expect(dialog).toContainText('20612137880')
  await expect(dialog.locator('.quote-item-table tbody tr')).toHaveCount(2)
  await dialog.getByRole('button', { name: 'Registrar envío', exact: true }).click()
  await dialog.getByLabel('Detalle o evidencia').fill('Registro ficticio para verificar un envío externo; no se envía ningún mensaje.')
  await dialog.getByRole('button', { name: 'Guardar registro' }).click()
  await expect(dialog.getByRole('button', { name: 'Registrar aceptación', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Registrar aceptación', exact: true }).click()
  await dialog.getByLabel('Destinatario o persona que confirmó').fill('Ana Comercial')
  await dialog.getByLabel('Detalle o evidencia').fill('Confirmación ficticia para verificar la aceptación de prueba.')
  await dialog.getByRole('button', { name: 'Guardar registro' }).click()
  await expect(dialog.locator('.quote-acceptance')).toContainText('Ana Comercial')
  await page.reload()
  await expect(page.getByLabel('Etapa del negocio')).toHaveValue('quoted')
  await page.locator('.quote-mini').click()
  await expect(dialog.locator('.quote-event-list li')).toHaveCount(2)
  await dialog.evaluate(element => { element.scrollTop = 0 })
  await page.screenshot({ path: testInfo.outputPath('propuesta-intercert-desktop.png') })
  await page.pdf({ path: testInfo.outputPath('propuesta-intercert.pdf'), format: 'A4', printBackground: true })
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(dialog.locator('.quote-reference')).toContainText('Aceptada')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('propuesta-intercert-mobile.png') })
  await page.keyboard.press('Escape')
  snapshot = await (await request.get('/api/crm/state')).json()
  const anotherContact = await request.post('/api/crm/commands', { headers: { Origin: 'http://127.0.0.1:5175' }, data: {
    revision: snapshot.revision, requestId: 'quote-e2e-another-contact', operation: 'intake', payload: {
      company: companyName, ruc, contact: 'Bruno Compras', email: 'bruno@example.com', kind: 'manual', service: 'ISO 9001',
    },
  } })
  expect(anotherContact.ok()).toBe(true)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`/empresas?empresa=${company.id}`)
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByRole('link', { name: '2 contactos' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await page.getByRole('searchbox', { name: 'Buscar registros' }).fill('Bruno Compras')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.locator('tbody')).not.toContainText('Ana Comercial')
  await page.goto('/')
  await page.getByRole('button', { name: 'Nuevo prospecto' }).click()
  await expect(dialog.getByLabel('Responsable').getByRole('option', { name: 'Lucía Mendoza (prueba)' })).toHaveCount(1)
  await expect(dialog.getByLabel('Responsable').getByRole('option', { name: 'Diego Salazar (prueba)' })).toHaveCount(1)
  expect(errors).toEqual([])
})
