import { expect, test } from '@playwright/test'
import type { Snapshot } from '../src/types'

test('deals move between stages by dragging cards, and the closing rules still apply', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const state = async (): Promise<Snapshot> => (await request.get('/api/crm/state')).json()
  const created = await request.post('/api/crm/commands', { headers: { Origin: 'http://127.0.0.1:5175' }, data: {
    revision: (await state()).revision, requestId: crypto.randomUUID(), operation: 'intake',
    payload: { company: 'Empresa Arrastre E2E', ruc: '20997720001', contact: 'Ana Arrastre', kind: 'quote', service: 'ISO 9001' },
  } })
  expect(created.ok()).toBe(true)
  const snapshot: Snapshot = await created.json()
  const company = snapshot.data.companies.find(c => c.name === 'Empresa Arrastre E2E')!
  const deal = snapshot.data.deals.find(d => d.companyId === company.id)!
  expect(deal.stage).toBe('new')
  const stageOnServer = async () => (await state()).data.deals.find(d => d.id === deal.id)!.stage
  const column = (name: string) => page.locator('.board-column').filter({ has: page.getByRole('heading', { name, exact: true }) })
  const card = page.locator('.deal-card').filter({ hasText: 'Empresa Arrastre E2E' })

  await page.setViewportSize({ width: 2300, height: 900 }) // las 7 columnas visibles a la vez
  await page.goto('/negocios?q=Empresa%20Arrastre')
  await expect(column('Nuevo').locator('.deal-card')).toHaveCount(1)
  await card.dragTo(column('Contactado'))
  await expect(column('Contactado').locator('.deal-card')).toHaveCount(1)
  await expect(column('Nuevo').locator('.deal-card')).toHaveCount(0)
  await expect.poll(stageOnServer).toBe('contacted')

  // Cerrar una venta sin monto lo rechaza el CRM: la tarjeta debe volver a su columna y avisar.
  await card.dragTo(column('Ganado'))
  await expect(page.getByRole('alert')).toContainText('Prepara una cotización')
  await expect(column('Contactado').locator('.deal-card')).toHaveCount(1)
  expect(await stageOnServer()).toBe('contacted')

  // Perder un negocio exige un motivo antes de mover la tarjeta.
  await card.dragTo(column('Perdido'))
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Registrar pérdida')
  expect(await stageOnServer()).toBe('contacted')
  await dialog.getByLabel('Motivo de pérdida').fill('El cliente ya tiene certificación vigente.')
  await dialog.getByRole('button', { name: 'Marcar como perdido' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(column('Perdido').locator('.deal-card')).toHaveCount(1)
  await expect.poll(stageOnServer).toBe('lost')

  await page.reload()
  await expect(column('Perdido').locator('.deal-card')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('board tools: my deals, sorting, contact on the card, per-column totals and CSV export', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const state = async (): Promise<Snapshot> => (await request.get('/api/crm/state')).json()
  const command = async (operation: string, payload: unknown) => {
    const response = await request.post('/api/crm/commands', { headers: { Origin: 'http://127.0.0.1:5175' }, data: {
      revision: (await state()).revision, requestId: crypto.randomUUID(), operation, payload,
    } })
    expect(response.ok()).toBe(true)
  }
  const me: string = (await (await request.get('/api/crm/session')).json()).user.name
  const service = 'ISO E2E-ORDEN'
  await command('intake', { company: 'Empresa Orden A E2E', ruc: '20997730001', kind: 'quote', service, owner: me })
  await command('intake', { company: 'Empresa Orden B E2E', ruc: '20997730002', contact: 'Bruno Orden', email: 'bruno.orden@example.com', kind: 'quote', service, owner: 'Otro Asesor E2E' })
  await command('intake', { company: '=CMD E2E', ruc: '20997730003', kind: 'quote', service, owner: 'Otro Asesor E2E' })

  await page.setViewportSize({ width: 2300, height: 900 })
  await page.goto('/negocios?q=E2E-ORDEN')
  const column = (name: string) => page.locator('.board-column').filter({ has: page.getByRole('heading', { name, exact: true }) })
  const names = column('Nuevo').locator('.deal-card h3')
  await expect(names).toHaveText(['=CMD E2E', 'Empresa Orden B E2E', 'Empresa Orden A E2E'])
  await expect(column('Nuevo')).toContainText('Total:')

  await page.getByLabel('Ordenar negocios').selectOption('antiguos')
  await expect(names).toHaveText(['Empresa Orden A E2E', 'Empresa Orden B E2E', '=CMD E2E'])

  await page.getByRole('button', { name: /^Mis negocios/ }).click()
  await expect(names).toHaveText(['Empresa Orden A E2E'])
  await page.getByRole('button', { name: /^Todos los negocios/ }).click()
  await expect(names).toHaveCount(3)

  const cardB = page.locator('.deal-card').filter({ hasText: 'Empresa Orden B E2E' })
  await expect(cardB).toContainText('Bruno Orden')
  await expect(cardB).toContainText('Creado')
  const cardA = page.locator('.deal-card').filter({ hasText: 'Empresa Orden A E2E' })
  await cardA.getByRole('button', { name: 'Agregar contacto' }).click()
  await expect(page).toHaveURL(/\/negocios\?/) // el botón no abre el negocio
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nombre y apellido').fill('Ana Orden')
  await dialog.getByLabel('Correo').fill('ana.orden@example.com')
  await dialog.getByRole('button', { name: 'Guardar contacto' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(cardA).toContainText('Ana Orden')
  const after = await state()
  const company = after.data.companies.find(c => c.name === 'Empresa Orden A E2E')!
  const dealA = after.data.deals.find(d => d.companyId === company.id)!
  expect(after.data.contacts.find(c => c.id === dealA.contactId)?.name).toBe('Ana Orden')

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar' }).click()])
  expect(download.suggestedFilename()).toMatch(/^negocios-\d{4}-\d{2}-\d{2}\.csv$/)
  const csv = (await import('node:fs')).readFileSync(await download.path(), 'utf8')
  expect(csv.startsWith('﻿"Empresa","RUC","Servicio"')).toBe(true)
  expect(csv).toContain('"Empresa Orden A E2E","20997730001"')
  expect(csv).toContain('"Ana Orden","ana.orden@example.com"')
  expect(csv).toContain(`"'=CMD E2E"`) // una fórmula de un cliente no se ejecuta en la hoja de cálculo
  expect(csv.trim().split('\r\n')).toHaveLength(4)
  expect(errors).toEqual([])
})

test('board follow-up: quick actions, advanced filters, metrics and attention alerts', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const state = async (): Promise<Snapshot> => (await request.get('/api/crm/state')).json()
  const command = async (operation: string, payload: unknown) => {
    const response = await request.post('/api/crm/commands', { headers: { Origin: 'http://127.0.0.1:5175' }, data: {
      revision: (await state()).revision, requestId: crypto.randomUUID(), operation, payload,
    } })
    expect(response.ok()).toBe(true)
  }
  const service = 'ISO E2E-SEGUIMIENTO'
  await command('intake', { company: 'Empresa Seguimiento A E2E', ruc: '20997740001', contact: 'Sara Seguimiento', email: 'sara.seg@example.com', phone: '987654321', kind: 'quote', service })
  await command('intake', { company: 'Empresa Seguimiento B E2E', ruc: '20997740002', kind: 'quote', service })
  const after = await state()
  const dealB = after.data.deals.find(d => d.companyId === after.data.companies.find(c => c.name === 'Empresa Seguimiento B E2E')!.id)!
  await command('task', { dealId: dealB.id, title: 'Llamada atrasada E2E', dueAt: '2020-01-02T15:00:00.000Z' })

  await page.setViewportSize({ width: 2300, height: 900 })
  await page.goto('/negocios?q=E2E-SEGUIMIENTO')
  const cards = page.locator('.deal-card')
  const cardA = cards.filter({ hasText: 'Empresa Seguimiento A E2E' }), cardB = cards.filter({ hasText: 'Empresa Seguimiento B E2E' })
  await expect(cards).toHaveCount(2)
  await expect(page.getByLabel('Resumen de negocios')).toContainText('Cartera abierta')

  // Las acciones rápidas solo se activan si el contacto tiene el dato.
  await expect(cardA.getByRole('button', { name: 'Llamar' })).toBeEnabled()
  await expect(cardA.getByRole('button', { name: 'WhatsApp' })).toBeEnabled()
  await expect(cardB.getByRole('button', { name: 'Llamar' })).toBeDisabled()
  await expect(cardB.getByRole('button', { name: 'Correo' })).toBeDisabled()
  await cardA.getByRole('button', { name: 'Nota' }).click()
  await expect(page).toHaveURL(/\/negocios\?/) // las acciones no abren el negocio
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Detalle').fill('Se envió la propuesta por correo.')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(dialog).not.toBeVisible()
  await cardA.getByRole('button', { name: 'Tarea' }).click()
  await expect(dialog).toContainText('Programar próxima acción')
  await dialog.getByRole('button', { name: 'Cancelar' }).click()

  // Alertas: solo el negocio con una acción vencida requiere atención.
  await expect(cardB).toContainText('Vencida')
  await expect(cardB).toHaveClass(/attention/)
  await expect(cardA).not.toHaveClass(/attention/)
  await page.getByRole('button', { name: /^Requieren atención/ }).click()
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('Empresa Seguimiento B E2E')
  await page.getByRole('button', { name: /^Requieren atención/ }).click()
  await expect(cards).toHaveCount(2)

  // Panel de filtros: sin contacto, rango de valor y limpiar.
  await page.getByRole('button', { name: /^Filtros/ }).click()
  const panel = page.getByRole('region', { name: 'Filtros avanzados' })
  await panel.getByLabel('Sin contacto').click()
  await expect(panel.getByLabel('Sin contacto')).toBeChecked()
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('Empresa Seguimiento B E2E')
  await panel.getByLabel('Sin contacto').click()
  await expect(cards).toHaveCount(2)
  await panel.getByLabel('Valor mínimo (S/)').fill('1')
  await expect(cards).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Filtros/ })).toContainText('1')
  await page.getByRole('button', { name: 'Limpiar filtros' }).click()
  await expect(cards).toHaveCount(0) // la búsqueda también se limpia
  await expect(page.getByLabel('Valor mínimo (S/)')).toHaveValue('')
  expect(errors).toEqual([])
})

test('priority, expected close, weighted forecast and CSV import', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const state = async (): Promise<Snapshot> => (await request.get('/api/crm/state')).json()
  const created = await request.post('/api/crm/commands', { headers: { Origin: 'http://127.0.0.1:5175' }, data: {
    revision: (await state()).revision, requestId: crypto.randomUUID(), operation: 'intake',
    payload: { company: 'Empresa Prioridad E2E', ruc: '20997750001', kind: 'quote', service: 'ISO E2E-PRIORIDAD' },
  } })
  expect(created.ok()).toBe(true)
  const deal = (await state()).data.deals.find(d => d.service === 'ISO E2E-PRIORIDAD')!
  expect(deal.priority).toBe('normal')

  await page.setViewportSize({ width: 2300, height: 900 })
  await page.goto(`/negocios/${deal.id}`)
  await page.getByRole('button', { name: 'Editar' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Prioridad').selectOption('high')
  await dialog.getByLabel('Cierre esperado').fill('2031-01-15')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.properties')).toContainText('Alta')
  await expect(page.locator('.properties')).toContainText('15 ene')
  await expect.poll(async () => (await state()).data.deals.find(d => d.id === deal.id)?.expectedClose).toBe('2031-01-15')

  await page.goto('/negocios?q=E2E-PRIORIDAD')
  const card = page.locator('.deal-card').filter({ hasText: 'Empresa Prioridad E2E' })
  await expect(card).toContainText('Prioridad alta')
  await expect(card).toContainText('Cierre esperado')
  await expect(page.getByLabel('Resumen de negocios')).toContainText('Pronóstico ponderado')
  await expect(page.locator('.board-column').first()).toContainText('Ponderado:')
  await page.getByLabel('Ordenar negocios').selectOption('prioridad')
  await page.getByRole('button', { name: /^Filtros/ }).click()
  await page.getByRole('region', { name: 'Filtros avanzados' }).getByLabel('Prioridad').selectOption('low')
  await expect(page.locator('.deal-card')).toHaveCount(0)
  await page.getByRole('region', { name: 'Filtros avanzados' }).getByLabel('Prioridad').selectOption('high')
  await expect(card).toBeVisible()

  // Importación: dos filas válidas (separador «;», comillas y acentos) y una con RUC inválido.
  await page.goto('/negocios?q=E2E-IMPORT')
  await page.getByRole('button', { name: 'Importar' }).click()
  const importer = page.getByRole('dialog')
  const csv = '﻿Empresa;RUC;Servicio;Contacto;Correo;Teléfono;Origen\r\n'
    + '"Importada Uno, E2E";20997760001;ISO E2E-IMPORT;Luis Importa;luis.importa@example.com;+51 999 000 111;Portal LiciHub\r\n'
    + 'Importada Dos E2E;;ISO E2E-IMPORT;;;;Telegram\r\n'
    + 'Importada Tres E2E;123;ISO E2E-IMPORT;;;;Manual\r\n'
  await importer.getByLabel('Archivo CSV').setInputFiles({ name: 'negocios.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') })
  await expect(importer).toContainText('2 filas listas para importar · 1 con errores')
  await expect(importer).toContainText('Fila 4: El RUC debe tener 11 dígitos')
  await importer.getByRole('button', { name: 'Importar 2 negocios' }).click()
  await expect(importer).toContainText('Se importaron 2 negocios')
  await importer.locator('footer').getByRole('button', { name: 'Cerrar' }).click()
  const imported = page.locator('.deal-card h3')
  await expect(imported).toHaveCount(2)
  await expect(page.locator('.deal-card').filter({ hasText: 'Importada Uno, E2E' })).toContainText('Luis Importa')
  const after = await state()
  expect(after.data.companies.find(c => c.name === 'Importada Uno, E2E')?.ruc).toBe('20997760001')
  expect(after.data.deals.filter(d => d.service === 'ISO E2E-IMPORT')).toHaveLength(2)
  expect(errors).toEqual([])
})
