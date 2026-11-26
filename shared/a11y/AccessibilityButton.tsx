import { useAccessibility } from './context'

/** Acceso al panel «Apariencia y Accesibilidad». Cada app le da su propio estilo con `className`. */
export function AccessibilityButton({ className = 'lh-a11y-trigger', showLabel = false }: { className?: string; showLabel?: boolean }) {
  const { openPanel, isOpen } = useAccessibility()
  return (
    <button
      type="button"
      className={className}
      aria-label="Configuración de apariencia y accesibilidad"
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      title="Apariencia y accesibilidad"
      onClick={openPanel}
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10" cy="5.6" r="1.4" fill="currentColor" />
        <path d="M5.5 8.2 10 9l4.5-.8M10 9v3.2m0 0-2 3.6m2-3.6 2 3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {showLabel ? <span>Apariencia y accesibilidad</span> : null}
    </button>
  )
}
