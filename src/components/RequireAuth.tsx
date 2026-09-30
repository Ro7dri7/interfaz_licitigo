import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { salioExplicitamente, useSesion } from '../lib/auth'

/** Rutas que requieren cuenta: sin sesión se va a /ingresar y luego se vuelve a la ruta pedida. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const sesion = useSesion()
  const location = useLocation()
  if (sesion) return children
  if (salioExplicitamente()) return <Navigate to="/ingresar" replace />
  const volver = location.pathname + location.search
  return <Navigate to={`/ingresar?volver=${encodeURIComponent(volver)}`} replace />
}
