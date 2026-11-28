import { expect, test } from '@playwright/test'
import type { Snapshot } from '../src/types'

test('admin home: charts, custom properties, and filters by property and date', async ({ page, request }) => {
  test.setTimeout(90_000) // recorre muchas fichas; con la suite completa supera los 30 s por defecto
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const state = async (): Promise<Snapshot> => (await request.get('/api/crm/state')).json()
  const command = async (operation: string, payload: unknown) => {
    const response = await request.post('/api/crm/commands', { headers: { Origin: 'http://127.0.0.1:5175' }, data: {
      revision: (await state()).revision, requestId: crypto.randomUUID(), operation, payload,
    } })
    expect(response.ok()).toBe(true)
  }
  const setProperty = async (label: string, value: string) => {
    const field = page.getByLabel(label, { exact: true })
    // Solo se guarda si cambia (p. ej. el sector puede venir asignado automáticamente).
    const changed = (await field.inputValue()) !== value
    await field.fill(value)
    if (!changed) return
    await Promise.all([page.waitForResponse(r => r.url().endsWith('/api/crm/commands') && r.ok()), field.press('Enter')])
  }
  const ids: string[] = []
  for (const [i, origin] of ['Telegram', 'Telegram', 'Lici'].entries())
    await command('intake', { company: `Empresa Panel ${i} E2E`, ruc: `2099779100${i}`, contact: `Persona Panel ${i}`, kind: 'quote', service: 'ISO E2E-PANEL', origin })
  const snapshot = await state()
  for (const name of ['Empresa Panel 0 E2E', 'Empresa Panel 1 E2E', 'Empresa Panel 2 E2E'])
    ids.push(snapshot.data.deals.find(d => d.companyId === snapshot.data.companies.find(c => c.name === name)!.id)!.id)

  // El inicio del administrador es el panel; «Mi día» sigue en el menú.
  await page.setViewportSize({ width: 1500, height: 900 })
  await page.goto('/')
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole('heading', { name: 'Panel de administración' })).toBeVisible()
  for (const title of ['Negocios por origen', 'Producto más vendido', 'Cotizaciones', 'Embudo comercial', 'Evolución', 'Empresas a la venta'])
    await expect(page.getByRole('region', { name: title, exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: /ventas y negocios/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Mi día' })).toBeVisible()
  const kpi = (name: string) => page.locator('.admin-metrics > div').filter({ has: page.getByText(name, { exact: true }) }).locator('strong')

  // El admin crea una propiedad de lista para negocios.
  await page.goto('/admin/propiedades')
  await page.getByRole('button', { name: 'Nueva propiedad' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Se usa en *').selectOption('deal')
  await dialog.getByLabel(/^Tipo/).selectOption('select')
  await dialog.getByLabel('Nombre *').fill('Canal E2E')
  await dialog.getByLabel(/Opciones/).fill('Alfa\nBeta')
  await dialog.getByRole('button', { name: 'Crear propiedad' }).click()
  await expect(dialog).not.toBeVisible()
  const row = page.getByRole('row').filter({ hasText: 'Canal E2E' })
  await expect(row).toContainText('Lista de opciones')
  await expect(row).toContainText('Alfa, Beta')
  await expect(row).toContainText('0 de')

  // Se llena desde la ficha del negocio, junto con la propiedad Sector de la empresa.
  for (const [i, id] of ids.entries()) {
    await page.goto(`/negocios/${id}`)
    // Las propiedades de lista se escriben o eligen de sus sugerencias; Enter guarda el valor.
    await setProperty('Canal E2E', i < 2 ? 'Alfa' : 'Beta')
    await expect(page.getByLabel('Canal E2E', { exact: true })).toHaveValue(i < 2 ? 'Alfa' : 'Beta')
  }
  await page.goto(`/negocios/${ids[0]}`)
  await setProperty('Sector', 'Minería')
  await page.reload()
  await expect(page.getByLabel('Sector', { exact: true })).toHaveValue('Minería')
  await expect(page.getByLabel('Canal E2E', { exact: true })).toHaveValue('Alfa')

  // La vista previa del tablero muestra esos valores al administrador.
  await page.goto('/negocios?q=E2E-PANEL')
  await page.locator('.deal-card').filter({ hasText: 'Empresa Panel 0 E2E' }).getByRole('heading').click()
  const preview = page.getByRole('complementary', { name: 'Vista previa del negocio' })
  await expect(preview).toContainText('Propiedades personalizadas')
  await expect(preview).toContainText('Alfa')
  await expect(preview).toContainText('Minería')

  // Filtro personalizado por propiedad: Alfa son los 2 del chatbot; Beta es 1 del portal.
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Agregar filtro' }).click()
  await page.getByLabel('Campo del filtro 1').selectOption({ label: 'Canal E2E (negocios)' })
  await page.getByLabel('Valor del filtro 1').selectOption('Alfa')
  await expect(kpi('Negocios nuevos')).toHaveText('2')
  await expect(kpi('Desde el chatbot')).toHaveText('2')
  await expect(kpi('Desde el portal LiciHub')).toHaveText('0')
  await expect(page).toHaveURL(/f=/)
  await page.getByLabel('Valor del filtro 1').selectOption('Beta')
  await expect(kpi('Negocios nuevos')).toHaveText('1')
  await expect(kpi('Desde el chatbot')).toHaveText('0')
  await expect(kpi('Desde el portal LiciHub')).toHaveText('1')
  await expect(page.getByRole('region', { name: 'Empresas a la venta' })).toContainText('Empresa Panel 2 E2E')

  // Agrupar los gráficos por la propiedad nueva.
  await page.getByLabel('Valor del filtro 1').selectOption('')
  await page.getByLabel('Agrupar por propiedad').selectOption({ label: 'Canal E2E (negocios)' })
  await page.getByRole('region', { name: /ventas y negocios/ }).getByRole('button', { name: 'Negocios' }).click()
  const grouped = page.getByRole('list', { name: 'Canal E2E más vendido' })
  await expect(grouped).toContainText('Alfa')
  await expect(grouped.getByRole('listitem').filter({ hasText: 'Alfa' })).toContainText('2')

  // Filtro por fechas: hoy incluye los negocios; un rango antiguo no deja ninguno.
  await page.getByLabel('Valor del filtro 1').selectOption('Alfa')
  await page.getByRole('button', { name: '7 días' }).click()
  await expect(kpi('Negocios nuevos')).toHaveText('2')
  await page.getByLabel('Fecha desde').fill('2020-01-01')
  await page.getByLabel('Fecha hasta').fill('2020-12-31')
  await expect(kpi('Negocios nuevos')).toHaveText('0')
  await expect(page.getByText('No hay registros con estos filtros')).toBeVisible()
  await page.getByRole('button', { name: 'Limpiar filtros' }).click()
  await expect(page.getByLabel('Valor del filtro 1')).toHaveCount(0)
  await expect(page).not.toHaveURL(/f=|rango=/)

  // Archivar la propiedad la quita de las fichas y los filtros.
  await page.goto('/admin/propiedades')
  await page.getByRole('row').filter({ hasText: 'Canal E2E' }).getByRole('button', { name: 'Archivar' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Canal E2E' })).toContainText('Archivada')
  await page.goto(`/negocios/${ids[0]}`)
  await expect(page.getByLabel('Canal E2E', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})
