import { expect, test } from '@playwright/test'
import type { Snapshot } from '../src/types'

test('contact record: list tools, create and edit, links from deal and quote', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const state = async (): Promise<Snapshot> => (await request.get('/api/crm/state')).json()
  const command = async (operation: string, payload: unknown) => {
    const response = await request.post('/api/crm/commands', { headers: { Origin: 'http://127.0.0.1:5175' }, data: {
      revision: (await state()).revision, requestId: crypto.randomUUID(), operation, payload,
    } })
    expect(response.ok()).toBe(true)
  }
  await command('intake', { company: 'Empresa Ficha E2E', ruc: '20997770001', contact: 'Carla Ficha', email: 'carla.ficha@example.com', kind: 'quote', service: 'ISO E2E-FICHA' })
  const first = await state()
  const company = first.data.companies.find(c => c.name === 'Empresa Ficha E2E')!
  const deal = first.data.deals.find(d => d.companyId === company.id)!
  const carla = first.data.contacts.find(c => c.companyId === company.id)!
  const product = first.data.products.find(p => p.active)!
  await command('quote', { dealId: deal.id, productId: product.id, quantity: 1, validUntil: '2031-01-31' })

  // Lista: abrir la ficha, filtrar por datos faltantes y exportar.
  await page.goto('/contactos?q=Empresa%20Ficha%20E2E')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByLabel('Filtrar por datos').selectOption('sintelefono')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByLabel('Filtrar por datos').selectOption('sincorreo')
  await expect(page.locator('tbody tr')).toHaveCount(0)
  await page.getByLabel('Filtrar por datos').selectOption('')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar' }).click()])
  expect(download.suggestedFilename()).toMatch(/^contactos-\d{4}-\d{2}-\d{2}\.csv$/)
  const csv = (await import('node:fs')).readFileSync(await download.path(), 'utf8')
  expect(csv).toContain('"Carla Ficha","Empresa Ficha E2E","20997770001","carla.ficha@example.com"')

  await page.getByRole('link', { name: 'Carla Ficha' }).first().click()
  await expect(page).toHaveURL(new RegExp(`/contactos/${carla.id}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Carla Ficha' })).toBeVisible()
  await expect(page.getByLabel('Negocios del contacto')).toContainText('ISO E2E-FICHA')
  await expect(page.getByLabel('Contactar').getByRole('link', { name: 'Correo' })).toHaveAttribute('href', 'mailto:carla.ficha@example.com')
  await expect(page.getByLabel('Contactar').getByRole('button', { name: 'Llamar' })).toBeDisabled() // sin teléfono

  // Editar: ahora sí tiene teléfono y WhatsApp.
  await page.getByRole('button', { name: 'Editar contacto' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Teléfono').fill('987654321')
  await dialog.getByRole('button', { name: 'Guardar contacto' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByLabel('Contactar').getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/51987654321')
  await expect.poll(async () => (await state()).data.contacts.find(c => c.id === carla.id)?.phone).toBe('987654321')

  // Nuevo contacto en la misma empresa; el correo repetido se rechaza.
  await page.goto(`/contactos?empresa=${company.id}`)
  await page.getByRole('button', { name: 'Nuevo contacto' }).click()
  await dialog.getByLabel('Nombre y apellido').fill('Dario Compras')
  await dialog.getByLabel('Correo').fill('CARLA.ficha@example.com')
  await dialog.getByRole('button', { name: 'Guardar contacto' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Ya existe un contacto con ese correo')
  await dialog.getByLabel('Correo').fill('dario.compras@example.com')
  await dialog.getByRole('button', { name: 'Guardar contacto' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await expect(page.locator('tbody')).toContainText('Dario Compras')

  // Desde el negocio y desde la cotización se llega a la ficha.
  await page.goto(`/negocios/${deal.id}`)
  await page.locator('.contact-block').getByRole('link', { name: 'Carla Ficha' }).click()
  await expect(page).toHaveURL(new RegExp(`/contactos/${carla.id}$`))
  await page.goto(`/negocios/${deal.id}`)
  await page.locator('.quote-mini').click()
  await page.getByRole('dialog').getByRole('link', { name: 'Ver ficha del contacto' }).click()
  await expect(page).toHaveURL(new RegExp(`/contactos/${carla.id}$`))
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('Otros contactos de la empresa')).toContainText('Dario Compras')
  expect(errors).toEqual([])
})
