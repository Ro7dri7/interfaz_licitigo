import { useId } from 'react'
import { useAccessibility } from './context'
import { RATES } from './prefs.mjs'

/** Barra flotante del lector de voz (esquina inferior derecha; oculta al imprimir). */
export function ReaderBar() {
  const { prefs, setPrefs, speech } = useAccessibility()
  const id = useId()
  const status = !speech.supported
    ? 'Tu navegador no admite lectura en voz alta.'
    : speech.speaking
      ? speech.paused
        ? 'En pausa.'
        : 'Leyendo…'
      : 'Listo para leer.'

  return (
    <section className="lh-reader-bar" aria-labelledby={`${id}-title`} data-lh-reader-controls="">
      <header>
        <h2 id={`${id}-title`}>Lector de voz</h2>
        <button type="button" className="lh-a11y-btn icon" aria-label="Cerrar lector de voz" onClick={() => setPrefs({ reader: false }, 'Lector de voz desactivado.')}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      {speech.supported ? (
        <>
          <div className="lh-a11y-row">
            <button type="button" className="lh-a11y-btn primary" onClick={speech.readPage}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 6v4h3l4 3V3L5 6H2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M11.5 5.5a3.5 3.5 0 0 1 0 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Leer esta página
            </button>
            <button
              type="button"
              className="lh-a11y-btn icon"
              aria-label={speech.speaking && !speech.paused ? 'Pausar lectura' : 'Reproducir lectura'}
              onClick={speech.toggle}
            >
              {speech.speaking && !speech.paused ? (
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                  <rect x="3.5" y="3" width="3" height="10" rx="1" fill="currentColor" />
                  <rect x="9.5" y="3" width="3" height="10" rx="1" fill="currentColor" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4.5 3v10l8-5-8-5Z" fill="currentColor" />
                </svg>
              )}
            </button>
            <button type="button" className="lh-a11y-btn icon" aria-label="Detener lectura" disabled={!speech.speaking} onClick={speech.stop}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor" />
              </svg>
            </button>
            <label className="lh-a11y-label">
              <select className="lh-a11y-select" aria-label="Velocidad de lectura" value={prefs.rate} onChange={(event) => setPrefs({ rate: Number(event.target.value) })}>
                {RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}x
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.readOnFocus}
            className="lh-a11y-switch"
            onClick={() => setPrefs({ readOnFocus: !prefs.readOnFocus }, prefs.readOnFocus ? 'Leer al enfocar desactivado.' : 'Leer al enfocar activado.')}
          >
            <span>Leer al enfocar / hacer clic</span>
            <span className="track" aria-hidden="true" />
          </button>
        </>
      ) : null}
      <p className="lh-reader-status" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  )
}
