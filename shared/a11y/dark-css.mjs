/**
 * Modo oscuro para hojas con colores fijos (el CSS del CRM usa hex directos).
 *
 * `darkTwins(css)` genera, para cada regla con propiedades de color, una regla "gemela"
 * `html.dark <selector>` con los colores convertidos. Todas las gemelas suben la misma
 * especificidad, así que entre ellas se respeta la cascada original. Van dentro de
 * `@media screen`, de modo que la impresión (cotización A4) siempre usa los colores claros.
 * Se ejecuta en el build (plugins de Vite del Portal y del CRM) y se prueba con node:test.
 */

const COLOR_PROPS = {
  color: 'fg',
  'caret-color': 'fg',
  'text-decoration-color': 'fg',
  fill: 'fg',
  background: 'bg',
  'background-color': 'bg',
  border: 'bd',
  'border-color': 'bd',
  'border-top': 'bd',
  'border-right': 'bd',
  'border-bottom': 'bd',
  'border-left': 'bd',
  'border-block': 'bd',
  'border-inline': 'bd',
  'border-top-color': 'bd',
  'border-right-color': 'bd',
  'border-bottom-color': 'bd',
  'border-left-color': 'bd',
  'border-block-color': 'bd',
  'border-inline-color': 'bd',
  outline: 'fg',
  'outline-color': 'fg',
  stroke: 'bd',
}

/** Superficie base del modo oscuro (tarjetas); el texto debe cumplir 4.5:1 sobre ella. */
export const DARK_SURFACE = '#141d2e'
/** Fondo elevado más claro (hover, cabeceras de tabla): el texto también debe leerse sobre él. */
export const DARK_RAISED = '#1e2940'

const NAMED = { white: '#ffffff', black: '#000000' }
const COLOR_TOKEN = /#[0-9a-fA-F]{3,8}\b|\b(?:white|black)\b/g

export function parseHex(value) {
  let hex = (NAMED[value.toLowerCase()] ?? value).replace('#', '')
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('')
  if (hex.length !== 6 && hex.length !== 8) return null
  const n = (i) => parseInt(hex.slice(i, i + 2), 16)
  return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? hex.slice(6, 8) : '' }
}

function toHsl({ r, g, b }) {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return { h: h * 60, s, l }
}

function fromHsl({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const hex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

export function luminance(value) {
  const c = typeof value === 'string' ? parseHex(value) : value
  const lin = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

/** Los grises neutros pasan al azul pizarra de la marca; los tonos con color conservan su matiz. */
function tint(hsl, maxSaturation) {
  return hsl.s < 0.15 ? { h: 220, s: maxSaturation } : { h: hsl.h, s: Math.min(hsl.s, maxSaturation) }
}

/** Convierte un color claro de la hoja original a su equivalente oscuro según su papel. */
export function darkColor(value, role) {
  const rgb = parseHex(value)
  if (!rgb) return value
  const hsl = toHsl(rgb)
  const vivid = hsl.s > 0.5 && hsl.l > 0.3 && hsl.l < 0.7
  let next
  if (role === 'fg') {
    if (hsl.l >= 0.8) return value
    next = { h: hsl.h, s: Math.min(hsl.s, 0.85), l: Math.max(0.68, 1 - hsl.l * 0.6) }
    // Garantiza 4.5:1 sobre la superficie oscura aclarando de a poco.
    let hex = fromHsl(next)
    while (contrast(hex, DARK_RAISED) < 4.6 && next.l < 0.97) {
      next.l += 0.02
      hex = fromHsl(next)
    }
    return hex + rgb.a
  }
  if (role === 'bg') {
    if (hsl.l < 0.3 || vivid) return value
    next = { ...tint(hsl, 0.4), l: Math.min(0.3, 0.13 + (1 - hsl.l) * 1.1) }
    return fromHsl(next) + rgb.a
  }
  if (vivid || hsl.l < 0.3) return value
  next = { ...tint(hsl, 0.3), l: Math.min(0.42, 0.2 + (1 - hsl.l) * 0.9) }
  return fromHsl(next) + rgb.a
}

function matchingBrace(css, open) {
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  throw new Error('CSS con llaves desbalanceadas.')
}

function splitTopLevel(text, separator) {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    if (char === separator && depth === 0) {
      parts.push(current)
      current = ''
    } else current += char
  }
  if (current.trim()) parts.push(current)
  return parts
}

function prefixSelector(selector, prefix) {
  return splitTopLevel(selector, ',')
    .map((part) => {
      const trimmed = part.trim()
      const root = trimmed.match(/^(?:html|:root)(?![\w-])([\s\S]*)$/)
      return root ? `${prefix}${root[1]}` : `${prefix} ${trimmed}`
    })
    .join(', ')
}

function twinDeclarations(body) {
  const out = []
  for (const declaration of splitTopLevel(body, ';')) {
    const colon = declaration.indexOf(':')
    if (colon === -1) continue
    const prop = declaration.slice(0, colon).trim().toLowerCase()
    const role = COLOR_PROPS[prop]
    if (!role) continue
    const value = declaration.slice(colon + 1).trim()
    let converted = value.replace(COLOR_TOKEN, (token) => darkColor(token, role))
    // El azul de marca como texto no llega a 4.5:1 sobre fondo oscuro: usa su variante clara.
    if (role === 'fg') converted = converted.replace(/var\(--color-primary(?:-dark)?\)/g, 'var(--lh-primary-text)')
    out.push(`${prop}: ${converted}`)
  }
  return out.join('; ')
}

function twinBlock(css, prefix, skip) {
  let result = ''
  let cursor = 0
  while (cursor < css.length) {
    const open = css.indexOf('{', cursor)
    if (open === -1) break
    const header = css.slice(cursor, open).trim()
    const close = matchingBrace(css, open)
    const body = css.slice(open + 1, close)
    cursor = close + 1
    if (!header) continue
    if (header.startsWith('@')) {
      if (/^@media\b/.test(header) && /\bprint\b/.test(header)) continue
      if (/^@(media|supports|layer|container)\b/.test(header)) {
        const inner = twinBlock(body, prefix, skip)
        if (inner) result += `${header}{${inner}}`
      }
      continue
    }
    if (skip && skip.test(header)) continue
    const declarations = twinDeclarations(body)
    if (declarations) result += `${prefixSelector(header, prefix)}{${declarations}}\n`
  }
  return result
}

/**
 * Reglas oscuras gemelas para `css`. `skip` excluye selectores que ya son oscuros
 * (p. ej. el panel azul marino del radar).
 */
export function darkTwins(css, { prefix = 'html.dark', skip = /radar-/ } = {}) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const twins = twinBlock(clean, prefix, skip)
  return twins ? `\n@media screen{\n${twins}}\n` : ''
}
