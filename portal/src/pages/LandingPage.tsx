import { LandingBento } from '../components/landing/LandingBento'
import { LandingFooter } from '../components/landing/LandingFooter'
import { LandingHero } from '../components/landing/LandingHero'
import { LandingImpacto } from '../components/landing/LandingImpacto'
import { LandingNav } from '../components/landing/LandingNav'
import { LandingPrecios } from '../components/landing/LandingPrecios'
import { LandingTelegram } from '../components/landing/LandingTelegram'
import { useSesion } from '../lib/auth'

export function LandingPage() {
  const sesion = useSesion()
  return (
    <div className="landing min-h-full scroll-smooth bg-brand-bg font-landing text-brand-ink antialiased selection:bg-brand-blue selection:text-white">
      <LandingNav sesion={sesion} />
      <LandingHero sesion={sesion} />
      <LandingBento />
      <LandingTelegram />
      <LandingImpacto />
      <LandingPrecios sesion={sesion} />
      <LandingFooter />
    </div>
  )
}
