import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { prepareBrandCss, scopeStylesheet } from '../scripts/crm-shell-css.mjs'

const bare = /(?:^|\{)\s*(?:\*|\*::?[\w-]+|html|body|:root|#root|button|a|main|input|label|select|textarea|svg|small|h[1-4])(?![\w-])/

test('el CSS del CRM queda bajo .crm-shell y no reescribe html ni botones del portal', () => {
  const styles = scopeStylesheet(readFileSync(new URL('../crm/src/styles.css', import.meta.url), 'utf8'))
  const brand = scopeStylesheet(prepareBrandCss(readFileSync(new URL('../crm/src/brand.css', import.meta.url), 'utf8')))
  assert.match(styles, /\.crm-shell \.app-shell/)
  assert.match(styles, /\.crm-shell \.metrics\{/)
  assert.match(styles, /\.crm-shell \.admin-metrics/)
  assert.match(styles, /\.crm-shell \.deal-card/)
  assert.doesNotMatch(styles, /(?<!shell )\.metrics\{/)
  assert.doesNotMatch(styles, /(?<!shell )\.column-foot\{/)
  assert.match(styles, /\.crm-shell button/)
  assert.match(styles, /\.crm-shell main/)
  assert.doesNotMatch(styles, bare)
  assert.doesNotMatch(brand, /@import\s+['"]tailwindcss['"]/)
  assert.doesNotMatch(brand, /@theme\b/)
  assert.match(brand, /\.crm-shell h1/)
  assert.doesNotMatch(brand, bare)
})
