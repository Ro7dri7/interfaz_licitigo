import { expect, test } from '@playwright/test'

const prefsKey = 'licihub_a11y_prefs'

test('apariencia y accesibilidad: tema, escala, teclado, lector de voz e impresión clara', async ({ page }) => {
  test.setTimeout(120_000) // el primer arranque de Vite puede tardar
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/negocios')
  await expect(page.locator('main#main-content')).toBeVisible()

  // Saltar al contenido: primer Tab de la página y enfoca <main>.
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Saltar al contenido principal' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main#main-content')).toBeFocused()

  // Panel accesible desde la cabecera; Escape lo cierra y devuelve el foco.
  const trigger = page.getByRole('button', { name: 'Configuración de apariencia y accesibilidad' })
  await trigger.click()
  const panel = page.getByRole('dialog', { name: 'Apariencia y Accesibilidad' })
  await expect(panel).toBeVisible()
  await panel.getByLabel('Oscuro').check()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const surface = await page.locator('.sidebar').evaluate(el => getComputedStyle(el).backgroundColor)
  expect(surface).not.toBe('rgb(255, 255, 255)')

  await panel.getByRole('button', { name: 'Aumentar tamaño de fuente' }).click()
  await panel.getByLabel('125 %').check()
  await panel.getByRole('switch', { name: /Resaltar foco y enlaces/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-a11y-highlight', 'true')
  // Focus trap: Shift+Tab desde el primer control sigue dentro del panel.
  await panel.getByRole('button', { name: 'Cerrar panel de apariencia y accesibilidad' }).focus()
  await page.keyboard.press('Shift+Tab')
  expect(await panel.evaluate(el => el.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(trigger).toBeFocused()

  // Persistencia sin parpadeo: tras recargar, <html> ya viene oscuro y escalado antes de React.
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), prefsKey)
  expect(stored).toMatchObject({ theme: 'dark', scale: 1.25, highlight: true })
  await page.reload()
  expect(await page.evaluate(() => [document.documentElement.className, document.documentElement.style.getPropertyValue('--lh-font-scale')])).toEqual(['dark', '1.25'])
  expect(await page.evaluate(() => getComputedStyle(document.body).zoom)).toBe('1.25')

  // Flechas en la navegación lateral.
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Mi día' }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Directorio' })).toBeFocused()

  // Lector de voz: la barra flotante aparece y se oculta al imprimir.
  await trigger.click()
  const reader = panel.getByRole('switch', { name: /^Lector de voz/ })
  if (await reader.isEnabled()) {
    await reader.click()
    await page.keyboard.press('Escape')
    const bar = page.getByRole('region', { name: 'Lector de voz' })
    await expect(bar).toBeVisible()
    await expect(bar.getByRole('button', { name: 'Leer esta página' })).toBeVisible()
    await page.emulateMedia({ media: 'print', colorScheme: 'light' })
    await expect(bar).toBeHidden()
  } else {
    await expect(panel.getByRole('note')).toContainText('no admite lectura')
    await page.keyboard.press('Escape')
    await page.emulateMedia({ media: 'print', colorScheme: 'light' })
  }

  // Impresión: siempre fondo claro y sin escala.
  expect(await page.evaluate(() => getComputedStyle(document.body).zoom)).toBe('1')
  const printed = await page.locator('.topbar').evaluate(el => getComputedStyle(el).backgroundColor)
  expect(printed).toBe('rgb(255, 255, 255)')
  await page.emulateMedia({ media: 'screen' })

  // «Predeterminado del sistema» sigue al sistema operativo en tiempo real.
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ theme: 'system' })), prefsKey)
  await page.reload()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  expect(errors).toEqual([])
})
