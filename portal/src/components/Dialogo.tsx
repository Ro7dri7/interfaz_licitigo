import { useEffect, useRef, type ReactNode } from 'react'
import { overlay } from '../lib/ui'

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface Props {
  onCerrar: () => void
  className: string
  /** id del título visible del diálogo (aria-labelledby). */
  tituloId?: string
  /** Nombre accesible cuando el diálogo no tiene un título con id. */
  etiqueta?: string
  children: ReactNode
}

/**
 * Diálogo modal del Portal: capa oscura, cierre con Escape o clic fuera, foco retenido dentro
 * y devuelto al botón que lo abrió, y página de fondo sin desplazamiento. Mismo comportamiento
 * que los diálogos nativos del CRM.
 */
export function Dialogo({ onCerrar, className, tituloId, etiqueta, children }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const cerrar = useRef(onCerrar)
  useEffect(() => {
    cerrar.current = onCerrar
  }, [onCerrar])

  useEffect(() => {
    const previo = document.activeElement
    const caja = panel.current
    const desborde = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const primero = caja?.querySelector<HTMLElement>(ENFOCABLES)
    ;(primero ?? caja)?.focus()
    const teclas = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cerrar.current()
        return
      }
      if (event.key !== 'Tab' || !caja) return
      const lista = [...caja.querySelectorAll<HTMLElement>(ENFOCABLES)].filter((el) => el.getClientRects().length > 0)
      if (!lista.length) return
      const [inicio, fin] = [lista[0], lista[lista.length - 1]]
      if (event.shiftKey && (document.activeElement === inicio || document.activeElement === caja)) {
        event.preventDefault()
        fin.focus()
      } else if (!event.shiftKey && document.activeElement === fin) {
        event.preventDefault()
        inicio.focus()
      }
    }
    document.addEventListener('keydown', teclas)
    return () => {
      document.removeEventListener('keydown', teclas)
      document.body.style.overflow = desborde
      if (previo instanceof HTMLElement && previo.isConnected) previo.focus()
    }
  }, [])

  return (
    <div className={overlay} onClick={() => cerrar.current()}>
      <div
        ref={panel}
        className={`${className} focus:outline-none`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-label={tituloId ? undefined : etiqueta}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
