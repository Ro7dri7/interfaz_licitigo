import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { AccessibilityPanel } from './AccessibilityPanel'
import { AccessibilityContext, type AccessibilityValue } from './context'
import { installKeyboardNav } from './keyboard.mjs'
import { applyPrefs, defaultPrefs, loadPrefs, normalizePrefs, savePrefs, STORAGE_KEY, type A11yPrefs } from './prefs.mjs'
import { ReaderBar } from './ReaderBar'
import { createReader, describeElement, extractReadableText, isSpeechSupported, type Reader, type ReaderState } from './speech.mjs'
import './a11y.css'

const DARK_QUERY = '(prefers-color-scheme: dark)'
const INTERACTIVE = 'a[href],button,input,select,textarea,summary,[role],[tabindex],h1,h2,h3,h4,h5,h6,p,li,td,th,dt,dd,label'

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function systemDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches
  } catch {
    return false
  }
}

/** Raíz de lectura: el diálogo abierto si lo hay; si no, el contenido principal. */
function readingRoot(): Element {
  const dialogs = [...document.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]')].filter((el) => !el.closest('.lh-a11y-root'))
  return dialogs[dialogs.length - 1] ?? document.getElementById('main-content') ?? document.querySelector('main') ?? document.body
}

/**
 * Envuelve el Portal y el CRM: aplica tema, escala y resaltado en <html>, persiste en
 * localStorage (`licihub_a11y_prefs`), instala la navegación por teclado y el lector de voz.
 * `routeKey` (la ruta actual) detiene la lectura al navegar.
 */
export function AccessibilityProvider({ children, routeKey }: { children: ReactNode; routeKey?: string }) {
  const [prefs, setPrefsState] = useState<A11yPrefs>(() => {
    const store = storage()
    return store ? loadPrefs(store) : defaultPrefs()
  })
  const [prefersDark, setPrefersDark] = useState(systemDark)
  const [isOpen, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [readerState, setReaderState] = useState<ReaderState>({ speaking: false, paused: false })
  const [voiceName, setVoiceName] = useState('')
  const reader = useRef<Reader | null>(null)
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const supported = useMemo(() => typeof window !== 'undefined' && isSpeechSupported(window), [])

  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && prefersDark)

  // Tema, escala y resaltado en <html>; el script de arranque de index.html ya lo hizo antes del primer pintado.
  useEffect(() => {
    applyPrefs(document.documentElement, prefs, prefersDark)
  }, [prefs, prefersDark])

  useEffect(() => {
    const store = storage()
    if (!store) return
    try {
      savePrefs(store, prefs)
    } catch {
      /* almacenamiento lleno o bloqueado: las preferencias siguen vigentes en esta sesión */
    }
  }, [prefs])

  // «Predeterminado del sistema» sigue al sistema operativo en tiempo real.
  useEffect(() => {
    let media: MediaQueryList
    try {
      media = window.matchMedia(DARK_QUERY)
    } catch {
      return
    }
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  // Otra pestaña cambió las preferencias.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      const store = storage()
      if (store) setPrefsState(loadPrefs(store))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => installKeyboardNav(document), [])

  useEffect(() => {
    if (!supported) return
    const instance = createReader({
      win: window,
      onChange: (state) => {
        setReaderState(state)
        setVoiceName(instance.voiceName)
      },
    })
    reader.current = instance
    setVoiceName(instance.voiceName)
    return () => {
      instance.dispose()
      reader.current = null
    }
  }, [supported])

  // Al cambiar de ruta no deben solaparse voces.
  useEffect(() => {
    reader.current?.stop()
    setOpen(false)
  }, [routeKey])

  useEffect(() => {
    if (!prefs.reader) reader.current?.stop()
  }, [prefs.reader])

  const announce = useCallback((text: string) => {
    setMessage('')
    window.setTimeout(() => setMessage(text), 60)
  }, [])

  const setPrefs = useCallback(
    (patch: Partial<A11yPrefs>, announcement?: string) => {
      setPrefsState((current) => normalizePrefs({ ...current, ...patch }))
      if (announcement) announce(announcement)
    },
    [announce],
  )

  const speak = useCallback((text: string) => {
    reader.current?.speak(text, prefsRef.current.rate)
  }, [])

  const readPage = useCallback(() => {
    const text = extractReadableText(readingRoot())
    if (!reader.current?.speak(text || 'No hay contenido para leer en esta vista.', prefsRef.current.rate)) announce('No hay contenido para leer.')
  }, [announce])

  const toggle = useCallback(() => {
    const current = reader.current
    if (!current) return
    if (!current.state.speaking) readPage()
    else if (current.state.paused) current.resume()
    else current.pause()
  }, [readPage])

  const stop = useCallback(() => reader.current?.stop(), [])

  // Modo «Leer al enfocar / hacer clic».
  useEffect(() => {
    if (!supported || !prefs.reader || !prefs.readOnFocus) return
    const read = (el: Element | null) => {
      const text = describeElement(el)
      if (text) reader.current?.speak(text, prefsRef.current.rate)
    }
    const onFocus = (event: FocusEvent) => {
      const el = event.target as Element | null
      if (!el || el.nodeType !== 1) return
      let keyboard = true
      try {
        keyboard = el.matches(':focus-visible')
      } catch {
        /* navegadores sin :focus-visible */
      }
      if (keyboard) read(el)
    }
    const onClick = (event: globalThis.MouseEvent) => {
      const target = event.target as Element | null
      if (!target || target.closest('[data-lh-reader-controls]')) return
      read(target.closest(INTERACTIVE) ?? target)
    }
    document.addEventListener('focusin', onFocus)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('click', onClick)
    }
  }, [supported, prefs.reader, prefs.readOnFocus])

  const value = useMemo<AccessibilityValue>(
    () => ({
      prefs,
      dark,
      setPrefs,
      reset: () => {
        setPrefsState(defaultPrefs())
        announce('Preferencias restablecidas.')
      },
      isOpen,
      openPanel: () => setOpen(true),
      closePanel: () => setOpen(false),
      speech: { supported, speaking: readerState.speaking, paused: readerState.paused, voiceName, readPage, toggle, stop, speak },
      announce,
    }),
    [prefs, dark, setPrefs, isOpen, supported, readerState, voiceName, readPage, toggle, stop, speak, announce],
  )

  const skipToMain = (event: MouseEvent<HTMLAnchorElement>) => {
    const main = document.getElementById('main-content') ?? document.querySelector('main')
    if (!main) return
    event.preventDefault()
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1')
    ;(main as HTMLElement).focus()
    main.scrollIntoView({ block: 'start' })
  }

  return (
    <AccessibilityContext.Provider value={value}>
      <a className="lh-skip-link" href="#main-content" onClick={skipToMain}>
        Saltar al contenido principal
      </a>
      {children}
      <div className="lh-a11y-root lh-a11y-ignore">
        <div className="lh-a11y-live" role="status" aria-live="polite" aria-atomic="true">
          {message}
        </div>
        {isOpen ? <AccessibilityPanel /> : null}
        {prefs.reader ? <ReaderBar /> : null}
      </div>
    </AccessibilityContext.Provider>
  )
}
