import { Navigate, Route, Routes } from 'react-router-dom'
import { DescubrimientoPage } from './pages/DescubrimientoPage'
import { LicitacionDetailPage } from './pages/LicitacionDetailPage'
import { EquipoPage } from './pages/EquipoPage'
import { LandingPage } from './pages/LandingPage'
import { OnboardingPage } from './pages/OnboardingPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/app/descubrimiento" element={<DescubrimientoPage />} />
      <Route path="/app/licitacion/*" element={<LicitacionDetailPage />} />
      <Route path="/app/equipo" element={<EquipoPage />} />
      <Route path="/app/perfil" element={<Navigate to="/app/equipo" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
