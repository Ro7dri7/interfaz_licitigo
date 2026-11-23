import { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'
import { registrarNavegador } from './lib/auth'
import { DescubrimientoPage } from './pages/DescubrimientoPage'
import { IngresarPage } from './pages/IngresarPage'
import { LandingPage } from './pages/LandingPage'
import { MisDesbloqueosPage } from './pages/MisDesbloqueosPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { PerfilPage } from './pages/PerfilPage'
import { RestablecerPage } from './pages/RestablecerPage'
import CrmShell from './crm/CrmShell'

export default function App() {
  const navigate = useNavigate()

  // Al cerrar sesión (o si la sesión vence) se vuelve a /ingresar desde cualquier parte.
  useEffect(() => {
    registrarNavegador((ruta) => navigate(ruta))
    return () => registrarNavegador(null)
  }, [navigate])

  return (
    <Routes>
      {import.meta.env.VITE_CRM_BASE && <Route path="/comercial/*" element={<CrmShell />} />}
      {import.meta.env.VITE_CRM_BASE && <Route path="/comercial" element={<CrmShell />} />}
      <Route path="/" element={<LandingPage />} />
      <Route path="/ingresar" element={<IngresarPage />} />
      <Route path="/ingresar/restablecer" element={<RestablecerPage />} />
      <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
      <Route path="/app/descubrimiento" element={<RequireAuth><DescubrimientoPage /></RequireAuth>} />
      <Route path="/app/desbloqueos" element={<RequireAuth><MisDesbloqueosPage /></RequireAuth>} />
      <Route path="/app/perfil" element={<RequireAuth><PerfilPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
