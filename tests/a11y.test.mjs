import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import { scopeStylesheet } from '../scripts/crm-shell-css.mjs'
import { contrast, DARK_SURFACE, darkColor, darkTwins } from '../shared/a11y/dark-css.mjs'
import { applyPrefs, defaultPrefs, loadPrefs, normalizePrefs, savePrefs, SCALES, STORAGE_KEY, stepScale, resolveDark } from '../shared/a11y/prefs.mjs'
import { chunkText, isSpeechSupported, pickSpanishVoice } from '../shared/a11y/speech.mjs'

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    raw: data,
  }
}

function fakeRoot() {
  const classes = new Set()
  const props = new Map()
  return {
    classes,
    props,
    classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) },
    dataset: {},
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = String(value)
    },
    style: {
      colorScheme: '',
      setProperty: (name, value) => props.set(name, String(value)),
      getPropertyValue: (name) => props.get(name) ?? '',
    },
  }
}

test('preferencias: valores por defecto y normalización de datos inválidos', () => {
  assert.equal(STORAGE_KEY, 'licihub_a11y_prefs')
  assert.deepEqual(defaultPrefs(), { theme: 'system', scale: 1, highlight: false, reader: false, readOnFocus: false, rate: 1 })
  assert.deepEqual(normalizePrefs({ theme: 'rosado', scale: 3, rate: 9, highlight: 'si' }), { ...defaultPrefs(), highlight: true })
  assert.deepEqual(normalizePrefs(null), defaultPrefs())
  assert.equal(normalizePrefs({ scale: '1.25' }).scale, 1.25)
})

test('preferencias: tema y escala se guardan y sobreviven a una recarga', () => {
  const store = memoryStorage()
  savePrefs(store, { theme: 'dark', scale: 1.4, highlight: true })
  assert.deepEqual(JSON.parse(store.raw.get(STORAGE_KEY)), { theme: 'dark', scale: 1.4, highlight: true, reader: false, readOnFocus: false, rate: 1 })
  const reloaded = loadPrefs(store)
  assert.equal(reloaded.theme, 'dark')
  assert.equal(reloaded.scale, 1.4)
  assert.equal(reloaded.highlight, true)
})

test('preferencias: JSON corrupto o almacenamiento bloqueado vuelven a los valores por defecto', () => {
  assert.deepEqual(loadPrefs(memoryStorage({ [STORAGE_KEY]: '{no es json' })), defaultPrefs())
  assert.deepEqual(loadPrefs({ getItem: () => { throw new Error('SecurityError') } }), defaultPrefs())
})

test('escala de fuente: A- / A+ recorren los niveles sin salirse de los límites', () => {
  assert.deepEqual(SCALES, [0.9, 1, 1.12, 1.25, 1.4])
  assert.equal(stepScale(1, 1), 1.12)
  assert.equal(stepScale(1.4, 1), 1.4)
  assert.equal(stepScale(0.9, -1), 0.9)
  assert.equal(stepScale(7, 1), 1.12)
})

test('tema: «Sistema» sigue a prefers-color-scheme y se refleja en <html>', () => {
  assert.equal(resolveDark('system', true), true)
  assert.equal(resolveDark('system', false), false)
  assert.equal(resolveDark('light', true), false)
  assert.equal(resolveDark('dark', false), true)
  const root = fakeRoot()
  applyPrefs(root, { ...defaultPrefs(), theme: 'dark', scale: 1.25, highlight: true }, false)
  assert.ok(root.classes.has('dark'))
  assert.equal(root.dataset.theme, 'dark')
  assert.equal(root.props.get('--lh-font-scale'), '1.25')
  assert.equal(root.dataset.a11yHighlight, 'true')
  applyPrefs(root, defaultPrefs(), false)
  assert.ok(!root.classes.has('dark'))
  assert.equal(root.dataset.theme, 'light')
  assert.equal(root.dataset.a11yHighlight, undefined)
})

function runBoot(html, stored, systemDark) {
  const script = html.match(/<script>(\(function\(\)\{[\s\S]*?licihub_a11y_prefs[\s\S]*?)<\/script>/)
  assert.ok(script, 'index.html debe traer el script de arranque')
  const root = fakeRoot()
  vm.runInNewContext(script[1], {
    document: { documentElement: root },
    localStorage: memoryStorage(stored === undefined ? {} : { [STORAGE_KEY]: stored }),
    window: { matchMedia: () => ({ matches: systemDark }) },
    String,
    JSON,
  })
  return root
}

for (const app of ['portal', 'crm']) {
  test(`${app}: el script de index.html aplica tema y escala antes de pintar (sin FOUC)`, () => {
    const html = readFileSync(new URL(`../${app}/index.html`, import.meta.url), 'utf8')
    const head = html.slice(0, html.indexOf('</head>'))
    assert.match(head, /licihub_a11y_prefs/, 'el script va en <head>')
    let root = runBoot(html, JSON.stringify({ theme: 'dark', scale: 1.25, highlight: true }), false)
    assert.ok(root.classes.has('dark'))
    assert.equal(root.attrs['data-theme'], 'dark')
    assert.equal(root.props.get('--lh-font-scale'), '1.25')
    assert.equal(root.attrs['data-a11y-highlight'], 'true')
    root = runBoot(html, undefined, true)
    assert.ok(root.classes.has('dark'), 'por defecto sigue al sistema')
    root = runBoot(html, JSON.stringify({ theme: 'light', scale: 99 }), true)
    assert.ok(!root.classes.has('dark'))
    assert.equal(root.props.has('--lh-font-scale'), false)
    assert.doesNotThrow(() => runBoot(html, '{roto', false))
  })
}

test('voz: elige es-PE, luego Latinoamérica y luego es-ES', () => {
  const voices = [
    { name: 'Monica', lang: 'es-ES' },
    { name: 'English', lang: 'en-US' },
    { name: 'Paulina', lang: 'es-MX' },
    { name: 'Google español de Estados Unidos', lang: 'es-US' },
  ]
  assert.equal(pickSpanishVoice(voices).lang, 'es-US')
  assert.equal(pickSpanishVoice([...voices, { name: 'Camila', lang: 'es-PE' }]).lang, 'es-PE')
  assert.equal(pickSpanishVoice([{ name: 'Monica', lang: 'es_ES' }, { name: 'x', lang: 'es-419' }]).lang, 'es-419')
  assert.equal(pickSpanishVoice([{ name: 'English', lang: 'en-US' }]), null)
  assert.equal(isSpeechSupported({}), false)
})

test('voz: el texto largo se parte en frases cortas sin perder contenido', () => {
  const text = 'Licitación de obras. '.repeat(40) + 'x'.repeat(500)
  const chunks = chunkText(text, 200)
  assert.ok(chunks.every((chunk) => chunk.length <= 200))
  assert.equal(chunks.join(' ').replace(/\s+/g, ''), text.replace(/\s+/g, ''))
  assert.deepEqual(chunkText('   '), [])
})

test('modo oscuro del CRM: reglas gemelas solo en pantalla, encapsuladas y con contraste AA', () => {
  const css = readFileSync(new URL('../crm/src/styles.css', import.meta.url), 'utf8')
  const twins = darkTwins(scopeStylesheet(css))
  assert.match(twins, /^\s*@media screen\{/)
  assert.doesNotMatch(twins, /@media print/)
  assert.doesNotMatch(twins, /radar-/)
  for (const selector of twins.match(/(?:^|\}|\n)([^{}@]+)\{/g) ?? []) {
    for (const part of selector.replace(/[{}\n]/g, '').split(',')) {
      if (part.trim()) assert.match(part.trim(), /^html\.dark \.crm-shell/, part)
    }
  }
  const colors = new Set(css.match(/(?<=[\s:])color:\s*(#[0-9a-fA-F]{3,6})\b/g)?.map((d) => d.split(':')[1].trim()))
  assert.ok(colors.size > 20)
  for (const color of colors) {
    const dark = darkColor(color, 'fg')
    if (dark === color) continue
    assert.ok(contrast(dark, DARK_SURFACE) >= 4.5, `${color} → ${dark}`)
  }
  assert.equal(darkColor('white', 'fg'), 'white', 'el texto blanco sobre botones de color se mantiene')
  assert.equal(darkColor('#2f5bea', 'bg'), '#2f5bea', 'los fondos de marca se mantienen')
})
