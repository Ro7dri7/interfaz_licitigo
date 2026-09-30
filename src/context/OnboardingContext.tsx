import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AlertChannel, Company, KeywordSuggestion, OnboardingStep } from '../types/models'

const STORAGE_KEY = 'lici.onboarding'

interface Guardado {
  company: Company | null
  keywords: KeywordSuggestion[]
  alertChannel: AlertChannel | null
}

interface OnboardingContextValue {
  step: OnboardingStep
  company: Company | null
  keywords: KeywordSuggestion[]
  alertChannel: AlertChannel | null
  selectedKeywords: string[]
  ciius: string[]
  setCompany: (company: Company) => void
  /** «No, otro RUC»: vuelve al paso del RUC sin empresa. */
  volverARuc: () => void
  confirmKeywords: (keywords: KeywordSuggestion[]) => void
  confirmAlertChannel: (channel: AlertChannel) => void
  reset: () => void
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

// Conserva el perfil al recargar (p. ej. al entrar directo a Descubrimiento).
function leerGuardado(): Guardado {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { company: null, keywords: [], alertChannel: null }
    const g = JSON.parse(raw) as Partial<Guardado>
    return { company: g.company ?? null, keywords: g.keywords ?? [], alertChannel: g.alertChannel ?? null }
  } catch {
    // sin almacenamiento disponible: se empieza de cero
    return { company: null, keywords: [], alertChannel: null }
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [guardado] = useState(leerGuardado)
  const [step, setStep] = useState<OnboardingStep>('ruc')
  const [company, setCompanyState] = useState<Company | null>(guardado.company)
  const [keywords, setKeywords] = useState<KeywordSuggestion[]>(guardado.keywords)
  const [alertChannel, setAlertChannel] = useState<AlertChannel | null>(guardado.alertChannel)

  useEffect(() => {
    const g: Guardado = { company, keywords, alertChannel }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(g))
    } catch {
      /* ignorar */
    }
  }, [company, keywords, alertChannel])

  const setCompany = useCallback((next: Company) => {
    setCompanyState(next)
    setStep('keywords')
  }, [])

  const volverARuc = useCallback(() => {
    setStep('ruc')
    setCompanyState(null)
  }, [])

  const confirmKeywords = useCallback((next: KeywordSuggestion[]) => {
    setKeywords(next)
    setStep('alerts')
  }, [])

  const confirmAlertChannel = useCallback((channel: AlertChannel) => {
    setAlertChannel(channel)
    setStep('done')
  }, [])

  const reset = useCallback(() => {
    setStep('ruc')
    setCompanyState(null)
    setKeywords([])
    setAlertChannel(null)
  }, [])

  const value = useMemo<OnboardingContextValue>(
    () => ({
      step,
      company,
      keywords,
      alertChannel,
      selectedKeywords: keywords.filter((k) => k.selected).map((k) => k.label),
      ciius: company?.ciius.map((c) => c.codigo) ?? [],
      setCompany,
      volverARuc,
      confirmKeywords,
      confirmAlertChannel,
      reset,
    }),
    [alertChannel, company, confirmAlertChannel, confirmKeywords, keywords, reset, setCompany, step, volverARuc],
  )

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export function useOnboarding(): OnboardingContextValue {
  const value = useContext(OnboardingContext)
  if (!value) throw new Error('useOnboarding debe usarse dentro de OnboardingProvider')
  return value
}
