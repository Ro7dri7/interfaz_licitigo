/** Lectura en voz alta con la Web Speech API (window.speechSynthesis). */

const LANG_RANK = ['es-pe', 'es-419', 'es-us', 'es-mx', 'es-co', 'es-cl', 'es-ar', 'es-es']
const QUALITY = /natural|neural|online|google|premium|enhanced/i

export function isSpeechSupported(win = globalThis) {
  return Boolean(win && 'speechSynthesis' in win && typeof win.SpeechSynthesisUtterance === 'function')
}

/** Elige la mejor voz en español: es-PE, luego Latinoamérica (es-419…), luego es-ES, luego cualquier es-*. */
export function pickSpanishVoice(voices) {
  const spanish = (voices || []).filter((voice) => /^es([-_]|$)/i.test(voice.lang || ''))
  if (!spanish.length) return null
  const rank = (voice) => {
    const lang = voice.lang.toLowerCase().replace('_', '-')
    const at = LANG_RANK.indexOf(lang)
    return (at === -1 ? LANG_RANK.length : at) * 10 + (QUALITY.test(voice.name || '') ? 0 : 1) + (voice.localService === false ? 0 : 0.5)
  }
  return [...spanish].sort((a, b) => rank(a) - rank(b))[0]
}

/** Parte un texto largo en frases de hasta `max` caracteres (Chrome corta los enunciados largos). */
export function chunkText(text, max = 220) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const sentences = clean.match(/[^.!?;:]+[.!?;:]*\s*/g) ?? [clean]
  const chunks = []
  let current = ''
  for (const raw of sentences) {
    let sentence = raw.trim()
    while (sentence.length > max) {
      const cut = sentence.lastIndexOf(' ', max) > max / 2 ? sentence.lastIndexOf(' ', max) : max
      if (current) {
        chunks.push(current)
        current = ''
      }
      chunks.push(sentence.slice(0, cut).trim())
      sentence = sentence.slice(cut).trim()
    }
    if (!sentence) continue
    if (current && current.length + sentence.length + 1 > max) {
      chunks.push(current)
      current = sentence
    } else current = current ? `${current} ${sentence}` : sentence
  }
  if (current) chunks.push(current)
  return chunks
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'svg', 'CANVAS', 'IFRAME', 'OBJECT', 'VIDEO', 'AUDIO', 'DATALIST', 'OPTION'])
const BLOCK_TAGS = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS', 'DIALOG', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE', 'TR', 'TD', 'TH', 'UL', 'LABEL', 'BUTTON', 'A', 'LEGEND', 'CAPTION'])

function hidden(el) {
  if (el.hidden || el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('inert')) return true
  if (el.classList?.contains('lh-a11y-ignore')) return true
  const view = el.ownerDocument?.defaultView
  if (view?.getComputedStyle) {
    const style = view.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return true
  }
  return false
}

/**
 * Texto limpio y en orden de lectura de `root` (normalmente <main>): títulos, párrafos,
 * tarjetas, celdas y botones, sin iconos SVG ni elementos ocultos.
 */
export function extractReadableText(root) {
  if (!root) return ''
  const blocks = []
  let buffer = ''
  const flush = () => {
    const text = buffer.replace(/\s+/g, ' ').trim()
    if (text && text !== blocks[blocks.length - 1]) blocks.push(text)
    buffer = ''
  }
  const walk = (node) => {
    if (node.nodeType === 3) {
      buffer += node.nodeValue
      return
    }
    if (node.nodeType !== 1 || SKIP_TAGS.has(node.tagName) || hidden(node)) return
    const tag = node.tagName
    if (tag === 'IMG') {
      const alt = node.getAttribute('alt')
      if (alt) buffer += ` ${alt} `
      return
    }
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
    const block = BLOCK_TAGS.has(tag)
    if (block) flush()
    const label = node.getAttribute('aria-label')
    const hasText = (node.textContent || '').trim().length > 0
    if (label && (!hasText || tag === 'BUTTON' || tag === 'A' || node.getAttribute('role') === 'img')) buffer += ` ${label} `
    else for (const child of node.childNodes) walk(child)
    if (block) flush()
  }
  walk(root)
  flush()
  return blocks.map((text) => (/[.!?:;…]$/.test(text) ? text : `${text}.`)).join(' ')
}

const ROLE_NAMES = { BUTTON: 'Botón', A: 'Enlace', SELECT: 'Lista desplegable', TEXTAREA: 'Campo de texto' }

/** Lo que se lee al enfocar o pulsar un elemento: su nombre accesible y su tipo. */
export function describeElement(el) {
  if (!el || el.nodeType !== 1) return ''
  const doc = el.ownerDocument
  const labelledBy = el.getAttribute('aria-labelledby')
  let name = el.getAttribute('aria-label') || (labelledBy ? labelledBy.split(/\s+/).map((id) => doc.getElementById(id)?.textContent || '').join(' ') : '')
  if (!name && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) {
    const label = el.id ? doc.querySelector(`label[for="${el.id}"]`) : null
    name = label?.textContent || el.closest('label')?.textContent || el.getAttribute('placeholder') || el.getAttribute('title') || ''
  }
  if (!name) name = el.getAttribute('alt') || (el.innerText ?? el.textContent ?? '') || el.getAttribute('title') || ''
  name = name.replace(/\s+/g, ' ').trim().slice(0, 280)
  if (!name) return ''
  const role = el.getAttribute('role')
  let kind = ROLE_NAMES[el.tagName] || ''
  if (el.tagName === 'INPUT') {
    const type = (el.getAttribute('type') || 'text').toLowerCase()
    kind = type === 'checkbox' ? `Casilla ${el.checked ? 'marcada' : 'sin marcar'}` : type === 'radio' ? `Opción ${el.checked ? 'seleccionada' : ''}`.trim() : type === 'submit' || type === 'button' ? 'Botón' : 'Campo'
  }
  if (role === 'switch') kind = `Interruptor ${el.getAttribute('aria-checked') === 'true' ? 'activado' : 'desactivado'}`
  else if (role === 'tab') kind = 'Pestaña'
  else if (role === 'menuitem') kind = 'Opción de menú'
  else if (role === 'button') kind = 'Botón'
  else if (role === 'link') kind = 'Enlace'
  return kind ? `${kind}: ${name}` : name
}

/**
 * Lector con cola de frases. `onChange({ speaking, paused })` avisa los cambios de estado.
 * Si el navegador no soporta speechSynthesis, `supported` es false y todo es no-op.
 */
export function createReader({ win = globalThis, onChange = () => {} } = {}) {
  const supported = isSpeechSupported(win)
  const synth = supported ? win.speechSynthesis : null
  let voice = null
  let queue = []
  let session = 0
  let state = { speaking: false, paused: false }
  const set = (next) => {
    state = { ...state, ...next }
    onChange(state)
  }
  const loadVoice = () => {
    if (synth) voice = pickSpanishVoice(synth.getVoices()) ?? voice
  }
  if (synth) {
    loadVoice()
    synth.addEventListener?.('voiceschanged', loadVoice)
  }

  const speakNext = (id, rate) => {
    if (id !== session) return
    const text = queue.shift()
    if (!text) {
      set({ speaking: false, paused: false })
      return
    }
    const utterance = new win.SpeechSynthesisUtterance(text)
    utterance.lang = voice?.lang || 'es-PE'
    if (voice) utterance.voice = voice
    utterance.rate = rate
    utterance.onend = () => speakNext(id, rate)
    utterance.onerror = () => speakNext(id, rate)
    synth.speak(utterance)
  }

  return {
    supported,
    get state() {
      return state
    },
    get voiceName() {
      return voice ? `${voice.name} (${voice.lang})` : ''
    },
    speak(text, rate = 1) {
      if (!synth) return false
      session += 1
      synth.cancel()
      queue = chunkText(text)
      if (!queue.length) {
        set({ speaking: false, paused: false })
        return false
      }
      loadVoice()
      set({ speaking: true, paused: false })
      speakNext(session, rate)
      return true
    },
    pause() {
      if (!synth || !state.speaking) return
      synth.pause()
      set({ paused: true })
    },
    resume() {
      if (!synth || !state.speaking) return
      synth.resume()
      set({ paused: false })
    },
    stop() {
      if (!synth) return
      session += 1
      queue = []
      synth.cancel()
      if (state.speaking || state.paused) set({ speaking: false, paused: false })
    },
    dispose() {
      this.stop()
      synth?.removeEventListener?.('voiceschanged', loadVoice)
    },
  }
}
