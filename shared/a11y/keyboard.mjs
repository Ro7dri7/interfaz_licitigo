/**
 * Navegación por teclado común al Portal y al CRM.
 * - Flecha arriba/abajo (y izquierda/derecha en barras horizontales) mueve el foco
 *   dentro de listas, menús, pestañas, tablas y resultados.
 * - Enter o Espacio activan cualquier elemento enfocable con rol interactivo.
 * Los componentes que ya manejan sus teclas (event.preventDefault) tienen prioridad.
 */

export const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

const HORIZONTAL = '[role="tablist"],[role="menubar"],[aria-orientation="horizontal"],nav,.tabs,.segmented,.directory-tabs'
const FLAT = '[role="menu"],[role="listbox"],[role="grid"],[role="tree"],' + HORIZONTAL
const GROUPED = '[data-a11y-nav],tbody,ul,ol,[role="list"]'
const CONTAINERS = `${FLAT},${GROUPED}`
const NATIVE = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'OPTION'])
const CLICK_ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'row', 'switch', 'checkbox', 'radio', 'treeitem', 'gridcell'])
const KEEP_KEYS_INPUTS = new Set(['checkbox', 'button', 'submit', 'reset', 'image', 'file', 'color'])

/** true si las flechas o Espacio pertenecen al propio control (escribir, mover un slider, radios). */
export function ownsKeys(el) {
  if (!el || !el.tagName) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return !KEEP_KEYS_INPUTS.has((el.getAttribute('type') || 'text').toLowerCase())
  return Boolean(el.closest?.('[data-a11y-keys="own"]'))
}

function visible(el) {
  if (el.closest('[hidden],[inert],[aria-hidden="true"]')) return false
  if (typeof el.checkVisibility === 'function') return el.checkVisibility()
  return el.getClientRects().length > 0
}

function firstFocusable(el) {
  if (el.matches(FOCUSABLE)) return el
  return [...el.querySelectorAll(FOCUSABLE)].find(visible) ?? null
}

function groupsOf(container) {
  const tagged = [...container.querySelectorAll('[data-a11y-item]')]
  if (tagged.length) return tagged
  if (container.tagName === 'TBODY') return [...container.rows]
  return [...container.children].filter((child) => child.matches('li,[role="listitem"],[data-a11y-item]') || container.matches('[data-a11y-nav]'))
}

/** Elementos entre los que se mueve el foco dentro de `container`, y el índice del actual. */
export function navItems(container, current) {
  if (container.matches(FLAT)) {
    const items = [...container.querySelectorAll(FOCUSABLE)].filter(visible)
    return { items, index: items.indexOf(current) }
  }
  const groups = groupsOf(container).filter(visible)
  const index = groups.findIndex((group) => group === current || group.contains(current))
  // Conserva la "columna": si el foco está en el 2.º botón de una fila, va al 2.º de la siguiente.
  const column = index === -1 ? 0 : [...groups[index].querySelectorAll(FOCUSABLE)].filter(visible).indexOf(current)
  const items = groups.map((group) => {
    if (column > 0) {
      const inner = [...group.querySelectorAll(FOCUSABLE)].filter(visible)
      if (inner[column]) return inner[column]
    }
    return firstFocusable(group)
  })
  return { items, index }
}

function containerFor(el) {
  let node = el.parentElement
  while (node) {
    const container = node.closest(CONTAINERS)
    if (!container) return null
    if (container.closest('[data-a11y-keys="own"]')) return null
    const { items, index } = navItems(container, el)
    if (index !== -1 && items.filter(Boolean).length > 1) return container
    node = container.parentElement
  }
  return null
}

function activate(el) {
  if (typeof el.click === 'function') el.click()
  else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: el.ownerDocument.defaultView }))
}

export function handleKeydown(event) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
  const el = event.target
  if (!el || el.nodeType !== 1 || ownsKeys(el)) return

  if (event.key === 'Enter' || event.key === ' ') {
    if (NATIVE.has(el.tagName) && !(el.tagName === 'A' && event.key === ' ')) return
    const role = el.getAttribute('role')
    const interactive = el.tagName === 'A' || CLICK_ROLES.has(role) || (el.tabIndex >= 0 && el.hasAttribute('tabindex') && el !== el.ownerDocument.body)
    if (!interactive) return
    event.preventDefault()
    activate(el)
    return
  }

  const vertical = event.key === 'ArrowDown' || event.key === 'ArrowUp'
  const horizontal = event.key === 'ArrowRight' || event.key === 'ArrowLeft'
  if (!vertical && !horizontal && event.key !== 'Home' && event.key !== 'End') return
  const container = containerFor(el)
  if (!container) return
  if (horizontal && !container.matches(HORIZONTAL)) return
  const { items, index } = navItems(container, el)
  const list = items.filter(Boolean)
  const at = list.indexOf(items[index])
  let next
  if (event.key === 'Home') next = list[0]
  else if (event.key === 'End') next = list[list.length - 1]
  else {
    const dir = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1
    const wrap = container.matches('[role="menu"],[role="menubar"],[role="tablist"]')
    const target = at + dir
    next = wrap ? list[(target + list.length) % list.length] : list[target]
  }
  if (!next || next === el) return
  event.preventDefault()
  next.focus()
  next.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

/** Instala la navegación en el documento. Devuelve la función para retirarla. */
export function installKeyboardNav(doc = document) {
  doc.addEventListener('keydown', handleKeydown)
  return () => doc.removeEventListener('keydown', handleKeydown)
}

/** Mantiene el foco dentro de `box` (diálogos). Llamar desde su keydown. */
export function trapFocus(event, box) {
  if (event.key !== 'Tab') return
  const items = [...box.querySelectorAll(FOCUSABLE)].filter(visible)
  if (!items.length) {
    event.preventDefault()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = box.ownerDocument.activeElement
  if (event.shiftKey && (active === first || !box.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !box.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}
