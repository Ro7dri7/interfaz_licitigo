import { expect, test } from '@playwright/test'

// Regresiones de la auditoría de interfaz: panel lateral de «Nuevo negocio», diálogos dentro del
// contenedor con estilos del Portal y filtro de responsable de la agenda.

test('nuevo negocio abre un panel lateral y permite crear y agregar otro', async ({ page, request }) => {
  await page.goto('/mi-dia')
  await page.getByRole('button', { name: 'Nuevo negocio' }).click()
  const drawer = page.getByRole('dialog', { name: 'Nuevo negocio' })
  await expect(drawer).toBeVisible()
  await expect(drawer).toHaveClass(/drawer/)
  const box = (await drawer.boundingBox())!, width = page.viewportSize()!.width
  expect(Math.round(box.x + box.width)).toBe(width)
  expect(box.height).toBeGreaterThan(page.viewportSize()!.height - 2)

  await drawer.getByLabel('Empresa *', { exact: true }).fill('Panel Lateral Uno E2E')
  await drawer.getByLabel('RUC', { exact: true }).fill('20991122331')
  await drawer.getByLabel('Servicio de interés').fill('ISO 14001')
  await drawer.getByRole('button', { name: 'Crear y agregar otro' }).click()
  await expect(drawer.getByRole('status').filter({ hasText: 'Negocio creado' })).toBeVisible()
  await expect(drawer.getByLabel('Empresa *', { exact: true })).toHaveValue('')
  await expect(drawer.getByLabel('RUC', { exact: true })).toHaveValue('')

  // Escribir una empresa registrada completa su RUC y avisa que el negocio se asociará a ella.
  await drawer.getByLabel('Empresa *', { exact: true }).fill('Panel Lateral Uno E2E')
  await expect(drawer.getByLabel('RUC', { exact: true })).toHaveValue('20991122331')
  await expect(drawer.getByText('Se asociará a la empresa registrada «Panel Lateral Uno E2E».')).toBeVisible()
  await drawer.getByLabel('Servicio de interés').fill('ISO 45001')
  await drawer.getByRole('button', { name: 'Crear negocio' }).click()
  await expect(drawer).not.toBeVisible()

  const { data } = await (await request.get('/api/crm/state')).json()
  const company = data.companies.filter((c: { name: string }) => c.name === 'Panel Lateral Uno E2E')
  expect(company).toHaveLength(1)
  expect(data.deals.filter((d: { companyId: string }) => d.companyId === company[0].id).map((d: { service: string }) => d.service).sort()).toEqual(['ISO 14001', 'ISO 45001'])
})

test('los diálogos y el menú contextual se montan dentro del contenedor con estilos del Portal', async ({ page }) => {
  await page.goto('/negocios')
  // En el Portal todo el CSS del CRM está bajo .crm-shell; se simula ese contenedor.
  await page.evaluate(() => document.getElementById('root')!.classList.add('crm-shell'))
  await page.getByRole('button', { name: 'Nuevo negocio' }).click()
  expect(await page.locator('dialog[open]').evaluate(el => Boolean(el.closest('.crm-shell')))).toBe(true)
  await page.keyboard.press('Escape')
  await page.locator('.deal-card').first().click({ button: 'right' })
  expect(await page.locator('.ctx-menu').evaluate(el => Boolean(el.closest('.crm-shell')))).toBe(true)
})

test('la agenda de un comercial muestra su nombre en el filtro aunque aún no tenga negocios', async ({ page }) => {
  await page.route('**/api/crm/session', async route => {
    const session = await (await route.fetch()).json()
    await route.fulfill({ json: { ...session, user: { name: 'Comercial Nuevo E2E', role: 'commercial' } } })
  })
  await page.goto('/agenda')
  const filter = page.getByRole('combobox', { name: 'Responsable' })
  await expect(filter).toHaveValue('Comercial Nuevo E2E')
  await expect(filter.locator('option:checked')).toHaveText('Comercial Nuevo E2E (tú)')
  await expect(page.getByRole('heading', { name: 'No hay tareas pendientes' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver todo el equipo' }).click()
  await expect(filter).toHaveValue('')
  await expect(page.locator('.task-row').first()).toBeVisible()
  for (const advisor of ['Lucía Mendoza (prueba)', 'Diego Salazar (prueba)', 'Sin asignar'])
    await expect(filter.locator('option', { hasText: advisor })).toHaveCount(1)
})
