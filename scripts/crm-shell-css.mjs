/** Encapsula el CSS del CRM bajo .crm-shell para que no pise el preflight del portal. */

export function prepareBrandCss(css) {
  const withoutImport = css.replace(/@import\s+['"]tailwindcss['"]\s*;?/g, '')
  return removeAtRule(withoutImport, '@theme')
}

export function scopeStylesheet(css, scope = '.crm-shell') {
  return scopeBlock(css.replace(/\/\*[\s\S]*?\*\//g, ''), scope)
}

function removeAtRule(css, name) {
  let result = ''
  let cursor = 0
  while (cursor < css.length) {
    const at = css.indexOf(name, cursor)
    if (at === -1) return result + css.slice(cursor)
    const brace = css.indexOf('{', at)
    if (brace === -1) return result + css.slice(cursor)
    result += css.slice(cursor, at)
    cursor = matchingBrace(css, brace) + 1
  }
  return result
}

function scopeBlock(css, scope) {
  let result = ''
  let cursor = 0
  while (cursor < css.length) {
    const open = css.indexOf('{', cursor)
    if (open === -1) return result + css.slice(cursor)
    const prelude = css.slice(cursor, open)
    const close = matchingBrace(css, open)
    const body = css.slice(open + 1, close)
    const header = prelude.trim()
    if (!header) result += `${prelude}{${body}}`
    else if (isNestingAtRule(header)) result += `${prelude}{${scopeBlock(body, scope)}}`
    else if (header.startsWith('@')) result += `${prelude}{${body}}`
    else result += `${prelude.slice(0, prelude.indexOf(header))}${prefixSelectors(header, scope)}{${body}}`
    cursor = close + 1
  }
  return result
}

function isNestingAtRule(header) {
  return /^@(media|supports|layer|container)\b/.test(header)
}

function prefixSelectors(selector, scope) {
  const seen = new Set()
  const prefixed = []
  for (const part of splitSelectors(selector)) {
    const next = prefixOne(part, scope)
    if (!seen.has(next)) {
      seen.add(next)
      prefixed.push(next)
    }
  }
  return prefixed.join(', ')
}

function prefixOne(selector, scope) {
  const trimmed = selector.trim()
  if (!trimmed || trimmed.startsWith(scope)) return trimmed
  const root = trimmed.match(/^(html|body|:root|#root)([\s\S]*)$/)
  if (root) return `${scope}${root[2]}`
  return `${scope} ${trimmed}`
}

function splitSelectors(selector) {
  const parts = []
  let current = ''
  let depth = 0
  for (const char of selector) {
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) parts.push(current)
  return parts
}

function matchingBrace(css, open) {
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    else if (css[index] === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  throw new Error('CSS del CRM con llaves desbalanceadas.')
}
