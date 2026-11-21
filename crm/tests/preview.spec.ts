import { expect, test } from '@playwright/test'
import type { Snapshot } from '../src/types'

test('clicking a deal opens its preview panel with company, contact, products and activity', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const state = async (): Promise<Snapshot> => (await request.get('/api/crm/state')).json()
  const command = async (operation: string, payload: unknown) => {
    const response = await request.post('/api/crm/commands', { headers: { Origin: 'http://127.0.0.1:5175' }, data: {
      revision: (await state()).revision, requestId: crypto.randomUUID(), operation, payload,
    } })
    expect(response.ok()).toBe(true)
  }
  await command('intake', { company: 'Empresa Vista Previa E2E', ruc: '20997790001', contact: 'Vera Previa', email: 'vera.previa@example.com', phone: '987654321', kind: 'quote', service: 'ISO E2E-PREVIA', owner: 'Rodrigo' })
  await command('intake', { company: 'Empresa Sin Contacto E2E', ruc: '20997790002', kind: 'quote', service: 'ISO E2E-PREVIA' })
  const snapshot = await state()
  const company = snapshot.data.companies.find(c => c.name === 'Empresa Vista Previa E2E')!
  const deal = snapshot.data.deals.find(d => d.companyId === company.id)!
  await command('activity', { dealId: deal.id, kind: 'call', text: 'Llamada de prueba para la vista previa.' })
  await command('task', { dealId: deal.id, title: 'Enviar propuesta E2E', dueAt: '2099-01-02T15:00:00.000Z' })

  // Con una cotización, la vista previa lista sus productos.
  await command('product', { name: 'Servicio Vista Previa E2E', price: '1500.00' })
  const product = (await state()).data.products.find(p => p.name === 'Servicio Vista Previa E2E')!
  await page.goto(`/negocios/${deal.id}`)
  await page.getByRole('button', { name: 'Cotizar', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Servicio de la partida 1').selectOption(product.id)
  await dialog.getByLabel('Válida hasta').fill('2099-12-31')
  await dialog.getByLabel('Condiciones comerciales y de pago').fill('Condiciones ficticias de prueba acordadas para esta propuesta.')
  await dialog.getByRole('button', { name: 'Guardar borrador' }).click()
  await expect(dialog).not.toBeVisible()

  await page.setViewportSize({ width: 1800, height: 900 })
  await page.goto('/negocios?q=E2E-PREVIA')
  const preview = page.getByRole('complementary', { name: 'Vista previa del negocio' })
  await expect(preview).toHaveCount(0)
  await page.locator('.deal-card').filter({ hasText: 'Empresa Vista Previa E2E' }).getByRole('heading').click()
  await expect(page).toHaveURL(/ver=/)
  await expect(page.locator('.deal-card.selected')).toHaveCount(1)
  await expect(preview).toContainText('Empresa Vista Previa E2E')
  await expect(preview).toContainText('ISO E2E-PREVIA')
  await expect(preview.locator('.pv-owner').filter({ hasText: 'Rodrigo' })).toBeVisible()
  await expect(preview).toContainText('20997790001')
  await expect(preview).toContainText('Vera Previa')
  await expect(preview).toContainText('vera.previa@example.com')
  await expect(preview).toContainText('987654321')
  await expect(preview).toContainText('Enviar propuesta E2E')
  await expect(preview).toContainText('Llamada de prueba para la vista previa.')
  await expect(preview.getByRole('heading', { name: 'Vista previa', exact: true })).toBeVisible()
  await expect(preview.getByText('Servicio Vista Previa E2E')).toBeVisible()
  await expect(preview.getByText(/S\/\s1,500\.00/).first()).toBeVisible()
  await expect(preview.getByRole('button', { name: 'Correo' })).toBeEnabled()
  await expect(preview.getByRole('button', { name: 'Llamada' })).toBeEnabled()

  // Las acciones del panel abren los formularios sin salir del tablero.
  await preview.getByRole('button', { name: 'Nota' }).click()
  await dialog.getByLabel('Detalle').fill('Nota creada desde la vista previa.')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(preview).toContainText('Nota creada desde la vista previa.')
  await expect(page).toHaveURL(/\/negocios\?/)

  // Otro negocio sin contacto: el panel cambia y los botones de contacto se desactivan.
  await page.locator('.deal-card').filter({ hasText: 'Empresa Sin Contacto E2E' }).getByRole('heading').click()
  await expect(preview).toContainText('Empresa Sin Contacto E2E')
  await expect(preview).not.toContainText('Vera Previa')
  await expect(preview).toContainText('Este negocio aún no tiene contacto.')
  await expect(preview.getByRole('button', { name: 'Correo' })).toBeDisabled()
  await expect(preview.getByText('Por cotizar').first()).toBeVisible()

  // Escape cierra el panel; "Ver registro" abre la ficha completa.
  await page.keyboard.press('Escape')
  await expect(preview).toHaveCount(0)
  await expect(page).not.toHaveURL(/ver=/)
  await page.locator('.deal-card').filter({ hasText: 'Empresa Vista Previa E2E' }).getByRole('heading').click()
  await preview.getByRole('link', { name: 'Ver registro' }).click()
  await expect(page).toHaveURL(new RegExp(`/negocios/${deal.id}$`))
  await page.goBack()
  await preview.getByRole('link', { name: 'Ver ficha de contacto →' }).click()
  await expect(page).toHaveURL(/\/contactos\//)

  // En la vista de lista, la fila abre el mismo panel.
  await page.goto('/negocios?vista=list&q=E2E-PREVIA')
  await page.getByRole('row').filter({ hasText: 'Empresa Sin Contacto E2E' }).getByText('ISO E2E-PREVIA').click()
  await expect(preview).toContainText('Empresa Sin Contacto E2E')
  await preview.getByRole('button', { name: 'Cerrar vista previa' }).click()
  await expect(preview).toHaveCount(0)
  expect(errors).toEqual([])
})

test('right-click on a deal offers to open it in a new tab or window', async ({ page, request, context }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const state = async (): Promise<Snapshot> => (await request.get('/api/crm/state')).json()
  const created = await request.post('/api/crm/commands', { headers: { Origin: 'http://127.0.0.1:5175' }, data: {
    revision: (await state()).revision, requestId: crypto.randomUUID(), operation: 'intake',
    payload: { company: 'Empresa Clic Derecho E2E', ruc: '20997790003', contact: 'Rita Derecha', kind: 'quote', service: 'ISO E2E-DERECHO' },
  } })
  expect(created.ok()).toBe(true)
  const snapshot: Snapshot = await created.json()
  const deal = snapshot.data.deals.find(d => d.companyId === snapshot.data.companies.find(c => c.name === 'Empresa Clic Derecho E2E')!.id)!

  await page.setViewportSize({ width: 1800, height: 900 })
  await page.goto('/negocios?q=E2E-DERECHO')
  const card = page.locator('.deal-card').filter({ hasText: 'Empresa Clic Derecho E2E' })
  const menu = page.getByRole('menu', { name: 'Acciones del negocio' })
  await card.click({ button: 'right' })
  await expect(menu).toBeVisible()
  await expect(page).not.toHaveURL(/ver=/) // el clic derecho no abre el panel
  await expect(menu.getByRole('menuitem')).toHaveText(['Abrir en una pestaña nueva', 'Abrir en una ventana nueva', 'Ver resumen', 'Copiar enlace'])

  const [tab] = await Promise.all([context.waitForEvent('page'), menu.getByRole('menuitem', { name: 'Abrir en una pestaña nueva' }).click()])
  await expect(tab).toHaveURL(new RegExp(`/negocios/${deal.id}$`))
  await expect(tab.getByLabel('Etapa del negocio')).toHaveValue('new')
  await tab.close()
  await expect(menu).toHaveCount(0)

  await card.click({ button: 'right' })
  const [win] = await Promise.all([context.waitForEvent('page'), menu.getByRole('menuitem', { name: 'Abrir en una ventana nueva' }).click()])
  await expect(win).toHaveURL(new RegExp(`/negocios/${deal.id}$`))
  await win.close()

  await card.click({ button: 'right' })
  await menu.getByRole('menuitem', { name: 'Ver resumen' }).click()
  await expect(page.getByRole('complementary', { name: 'Vista previa del negocio' })).toContainText('Empresa Clic Derecho E2E')
  await page.keyboard.press('Escape')

  // Escape cierra el menú sin hacer nada más; la vista de lista también lo ofrece.
  await page.goto('/negocios?vista=list&q=E2E-DERECHO')
  await page.getByRole('row').filter({ hasText: 'Empresa Clic Derecho E2E' }).click({ button: 'right' })
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  expect(errors).toEqual([])
})
