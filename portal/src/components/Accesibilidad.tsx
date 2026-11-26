import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { AccessibilityProvider } from '../../../shared/a11y'

/** Apariencia y accesibilidad (shared/a11y). La ruta actual detiene la lectura en voz alta al navegar. */
export function Accesibilidad({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <AccessibilityProvider routeKey={pathname}>{children}</AccessibilityProvider>
}
