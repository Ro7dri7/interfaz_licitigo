import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { useAccessibility } from './context'
import { trapFocus } from './keyboard.mjs'
import { RATES, SCALES, stepScale, type A11yPrefs } from './prefs.mjs'

const THEMES: [A11yPrefs['theme'], string, string][] = [
  ['system', 'Predeterminado del sistema', 'M3 4h14v9H3zM7 16h6'],
  ['light', 'Claro', 'M10 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM10 1v2M10 17v2M1 10h2M17 10h2'],
  ['dark', 'Oscuro', 'M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8Z'],
]

const percent = (scale: number) => `${Math.round(scale * 100)} %`
const themeName = (theme: A11yPrefs['theme']) => THEMES.find(([id]) => id === theme)?.[1] ?? ''

function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="lh-a11y-switch" disabled={disabled} onClick={() => onChange(!checked)}>
      <span>
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
      <span className="track" aria-hidden="true" />
    </button>
  )
}

/** Panel lateral «Apariencia y Accesibilidad»: diálogo modal con focus trap; Escape lo cierra. */
export function AccessibilityPanel() {
  const { prefs, setPrefs, closePanel, reset, speech } = useAccessibility()
  const box = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLElement>('input:checked, button')?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closePanel()
      return
    }
    if (box.current) trapFocus(event, box.current)
  }

  const setScale = (scale: number) => setPrefs({ scale }, `Tamaño de texto ${percent(scale)}.`)

  return (
    <div
      className="lh-a11y-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePanel()
      }}
    >
      <div ref={box} className="lh-a11y-panel" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`} onKeyDown={onKeyDown}>
        <header>
          <div>
            <h2 id={`${id}-title`}>Apariencia y Accesibilidad</h2>
            <p id={`${id}-desc`}>Los cambios se aplican al instante y se guardan en este navegador.</p>
          </div>
          <button type="button" className="lh-a11y-btn icon" aria-label="Cerrar panel de apariencia y accesibilidad" onClick={closePanel}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <fieldset className="lh-a11y-section">
          <legend>Tema visual</legend>
          <p className="lh-a11y-hint">«Sistema» sigue el modo claro u oscuro de tu dispositivo en tiempo real.</p>
          <div className="lh-a11y-options">
            {THEMES.map(([theme, label, icon]) => (
              <label key={theme} className="lh-a11y-option">
                <input
                  type="radio"
                  name={`${id}-theme`}
                  value={theme}
                  checked={prefs.theme === theme}
                  onChange={() => setPrefs({ theme }, `Tema: ${label}.`)}
                />
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d={icon} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="lh-a11y-section">
          <legend>Tamaño de fuente</legend>
          <p className="lh-a11y-hint">Escala todo el texto y los controles del Portal y del CRM.</p>
          <div className="lh-a11y-row" role="group" aria-label="Ajustar tamaño de fuente">
            <button type="button" className="lh-a11y-btn" aria-label="Disminuir tamaño de fuente" disabled={prefs.scale === SCALES[0]} onClick={() => setScale(stepScale(prefs.scale, -1))}>
              A-
            </button>
            <button type="button" className="lh-a11y-btn lh-a11y-scale-value" aria-label="Tamaño normal, 100 %" aria-pressed={prefs.scale === 1} onClick={() => setScale(1)}>
              100 %
            </button>
            <button type="button" className="lh-a11y-btn" aria-label="Aumentar tamaño de fuente" disabled={prefs.scale === SCALES[SCALES.length - 1]} onClick={() => setScale(stepScale(prefs.scale, 1))}>
              A+
            </button>
            <span aria-hidden="true" className="lh-a11y-hint" style={{ margin: 0 }}>
              Actual: {percent(prefs.scale)}
            </span>
          </div>
          <div className="lh-a11y-levels" role="radiogroup" aria-label="Nivel de tamaño de fuente">
            {SCALES.map((scale) => (
              <label key={scale} className="lh-a11y-option">
                <input type="radio" name={`${id}-scale`} value={scale} checked={prefs.scale === scale} onChange={() => setScale(scale)} />
                {percent(scale)}
              </label>
            ))}
          </div>
        </fieldset>

        <section className="lh-a11y-section" aria-labelledby={`${id}-keys`}>
          <h3 id={`${id}-keys`}>Navegación por teclado</h3>
          <Switch
            checked={prefs.highlight}
            onChange={(highlight) => setPrefs({ highlight }, highlight ? 'Resaltado de foco y enlaces activado.' : 'Resaltado de foco y enlaces desactivado.')}
            label="Resaltar foco y enlaces"
            hint="Anillo amarillo de alto contraste y enlaces subrayados, para baja visión."
          />
          <ul className="lh-a11y-keys">
            <li>
              <kbd>Tab</kbd>
              <kbd>Shift+Tab</kbd> recorren los controles.
            </li>
            <li>
              <kbd>↑</kbd>
              <kbd>↓</kbd> se mueven dentro de listas, menús, pestañas, tablas y resultados.
            </li>
            <li>
              <kbd>Enter</kbd>
              <kbd>Espacio</kbd> activan el elemento enfocado; <kbd>Esc</kbd> cierra diálogos.
            </li>
            <li>
              El enlace «Saltar al contenido principal» aparece con el primer <kbd>Tab</kbd>.
            </li>
          </ul>
        </section>

        <section className="lh-a11y-section" aria-labelledby={`${id}-voice`}>
          <h3 id={`${id}-voice`}>Lectura en voz alta</h3>
          {speech.supported ? null : (
            <p className="lh-a11y-notice" role="note">
              Tu navegador no admite lectura en voz alta (Web Speech API). Prueba con Chrome, Edge o Safari actualizados.
            </p>
          )}
          <Switch
            checked={prefs.reader}
            disabled={!speech.supported}
            onChange={(reader) => setPrefs({ reader }, reader ? 'Lector de voz activado. La barra está en la esquina inferior derecha.' : 'Lector de voz desactivado.')}
            label="Lector de voz"
            hint="Muestra una barra flotante para leer la página en español."
          />
          <Switch
            checked={prefs.readOnFocus}
            disabled={!speech.supported || !prefs.reader}
            onChange={(readOnFocus) => setPrefs({ readOnFocus }, readOnFocus ? 'Leer al enfocar activado.' : 'Leer al enfocar desactivado.')}
            label="Leer al enfocar / hacer clic"
            hint="Lee el texto o la etiqueta del elemento que enfocas con el teclado o pulsas."
          />
          <label className="lh-a11y-label" style={{ marginTop: 10 }}>
            Velocidad
            <select
              className="lh-a11y-select"
              value={prefs.rate}
              disabled={!speech.supported}
              onChange={(event) => setPrefs({ rate: Number(event.target.value) }, `Velocidad ${event.target.value}x.`)}
            >
              {RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}x
                </option>
              ))}
            </select>
          </label>
          {speech.supported && speech.voiceName ? <p className="lh-a11y-hint">Voz: {speech.voiceName}</p> : null}
        </section>

        <div className="lh-a11y-footer">
          <button type="button" className="lh-a11y-btn" onClick={reset}>
            Restablecer valores
          </button>
          <button type="button" className="lh-a11y-btn primary" onClick={closePanel}>
            Listo
          </button>
        </div>
        <p className="lh-a11y-hint" aria-live="polite">
          Tema: {themeName(prefs.theme)} · Texto: {percent(prefs.scale)}
        </p>
      </div>
    </div>
  )
}
