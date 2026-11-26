/** Preferencias de apariencia. Sin DOM: se prueba con node:test. */

export const STORAGE_KEY = 'licihub_a11y_prefs'
export const SCALES = [0.9, 1, 1.12, 1.25, 1.4]
export const RATES = [0.85, 1, 1.25, 1.5]

export function defaultPrefs() {
  return {
    theme: 'system',
    scale: 1,
    highlight: false,
    reader: false,
    readOnFocus: false,
    rate: 1,
  }
}

export function normalizePrefs(raw) {
  const base = defaultPrefs()
  if (!raw || typeof raw !== 'object') return base
  const theme = raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system' ? raw.theme : base.theme
  const scale = SCALES.includes(Number(raw.scale)) ? Number(raw.scale) : base.scale
  const rate = RATES.includes(Number(raw.rate)) ? Number(raw.rate) : base.rate
  return {
    theme,
    scale,
    highlight: Boolean(raw.highlight),
    reader: Boolean(raw.reader),
    readOnFocus: Boolean(raw.readOnFocus),
    rate,
  }
}

export function loadPrefs(storage) {
  try {
    const text = storage.getItem(STORAGE_KEY)
    return normalizePrefs(text ? JSON.parse(text) : null)
  } catch {
    return defaultPrefs()
  }
}

export function savePrefs(storage, prefs) {
  const next = normalizePrefs(prefs)
  storage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

/** true si el documento debe usar el tema oscuro. */
export function resolveDark(theme, prefersDark) {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return Boolean(prefersDark)
}

/** Sube o baja un nivel en SCALES (dir = 1 o -1). */
export function stepScale(scale, dir) {
  const at = SCALES.indexOf(Number(scale))
  const from = at === -1 ? SCALES.indexOf(1) : at
  return SCALES[Math.max(0, Math.min(SCALES.length - 1, from + Math.sign(dir)))]
}

/**
 * Refleja las preferencias en <html>: clase `dark`, `data-theme`, escala global
 * (`--lh-font-scale`) y el resaltado de foco. Devuelve si quedó en oscuro.
 */
export function applyPrefs(root, prefs, prefersDark) {
  const dark = resolveDark(prefs.theme, prefersDark)
  root.classList.toggle('dark', dark)
  root.dataset.theme = dark ? 'dark' : 'light'
  root.style.colorScheme = dark ? 'dark' : 'light'
  root.style.setProperty('--lh-font-scale', String(prefs.scale))
  if (prefs.highlight) root.dataset.a11yHighlight = 'true'
  else delete root.dataset.a11yHighlight
  return dark
}

/** Escala aplicada ahora mismo (para convertir coordenadas del puntero con `zoom`). */
export function currentScale(doc = globalThis.document) {
  const value = Number(doc?.documentElement?.style.getPropertyValue('--lh-font-scale'))
  return value > 0 ? value : 1
}
