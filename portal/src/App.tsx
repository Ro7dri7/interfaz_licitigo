import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { LicitacionPage } from './pages/LicitacionPage'
import { RequireAuth } from './components/RequireAuth'
import { registrarNavegador, useSesion } from './lib/auth'
import { DescubrimientoPage } from './pages/DescubrimientoPage'
import { IngresarPage } from './pages/IngresarPage'
import { LandingPage } from './pages/LandingPage'
import { MisDesbloqueosPage } from './pages/MisDesbloqueosPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { PagoRetorno } from './pages/PagoRetorno'
import { PerfilPage } from './pages/PerfilPage'
import { RestablecerPage } from './pages/RestablecerPage'
import CrmShell from './crm/CrmShell'

function RutaComercial() {
  const sesion = useSesion()
  const location = useLocation()
  if (!sesion) return <Navigate to="/ingresar" replace />
  if (sesion.rol !== 'admin' && sesion.rol !== 'commercial') return <Navigate to="/app/descubrimiento" replace />
  if (sesion.rol === 'commercial' && location.pathname.startsWith('/comercial/admin')) {
    return <Navigate to="/comercial" replace />
  }
  return <CrmShell />
}

export default function App() {
  const navigate = useNavigate()

  // Al cerrar sesión (o si la sesión vence) se vuelve a /ingresar desde cualquier parte.
  useEffect(() => {
    registrarNavegador((ruta) => navigate(ruta))
    return () => registrarNavegador(null)
  }, [navigate])

  return (
    <Routes>
      {import.meta.env.VITE_CRM_BASE && <Route path="/comercial/*" element={<RutaComercial />} />}
      <Route path="/" element={<LandingPage />} />
      <Route path="/ingresar" element={<IngresarPage />} />
      <Route path="/ingresar/restablecer" element={<RestablecerPage />} />
      <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
      <Route path="/app" element={<RequireAuth><PagoRetorno /></RequireAuth>} />
      <Route path="/app/descubrimiento" element={<RequireAuth><DescubrimientoPage /></RequireAuth>} />
      <Route path="/app/licitacion/:id" element={<RequireAuth><LicitacionPage /></RequireAuth>} />
      <Route path="/app/desbloqueos" element={<RequireAuth><MisDesbloqueosPage /></RequireAuth>} />
      <Route path="/app/perfil" element={<RequireAuth><PerfilPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
