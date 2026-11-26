import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Accesibilidad } from './components/Accesibilidad.tsx'
import { OnboardingProvider } from './context/OnboardingContext.tsx'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Accesibilidad>
        <OnboardingProvider>
          <App />
        </OnboardingProvider>
      </Accesibilidad>
    </BrowserRouter>
  </StrictMode>,
)
