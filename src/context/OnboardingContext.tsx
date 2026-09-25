import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AlertChannel, Company, KeywordSuggestion, OnboardingStep } from '../types/models'

const STORAGE_KEY = 'lici.onboarding'

interface SavedProfile {
  company: Company | null
  keywords: KeywordSuggestion[]
  alertChannel: AlertChannel | null
}

interface OnboardingContextValue {
  step: OnboardingStep
  company: Company | null
  keywords: KeywordSuggestion[]
  alertChannel: AlertChannel | null
  userName: string
  selectedKeywords: string[]
  ciius: string[]
  setCompany: (company: Company) => void
  confirmKeywords: (keywords: KeywordSuggestion[]) => void
  confirmAlertChannel: (channel: AlertChannel) => void
  reset: () => void
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

function readSaved(): SavedProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { company: null, keywords: [], alertChannel: null }
    const parsed = JSON.parse(raw) as Partial<SavedProfile>
    return {
      company: parsed.company ?? null,
      keywords: parsed.keywords ?? [],
      alertChannel: parsed.alertChannel ?? null,
    }
  } catch {
    return { company: null, keywords: [], alertChannel: null }
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const saved = readSaved()
  const [step, setStep] = useState<OnboardingStep>(saved.company ? 'keywords' : 'ruc')
  const [company, setCompanyState] = useState<Company | null>(saved.company)
  const [keywords, setKeywords] = useState<KeywordSuggestion[]>(saved.keywords)
  const [alertChannel, setAlertChannel] = useState<AlertChannel | null>(saved.alertChannel)

  useEffect(() => {
    const payload: SavedProfile = { company, keywords, alertChannel }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      /* sin almacenamiento disponible */
    }
  }, [company, keywords, alertChannel])

  const setCompany = useCallback((next: Company) => {
    setCompanyState(next)
    setStep('keywords')
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

  const value = useMemo<OnboardingContextValue>(() => {
    return {
      step,
      company,
      keywords,
      alertChannel,
      userName: 'Jorge',
      selectedKeywords: keywords.filter((item) => item.selected).map((item) => item.label),
      ciius: company?.ciius.map((item) => item.codigo) ?? [],
      setCompany,
      confirmKeywords,
      confirmAlertChannel,
      reset,
    }
  }, [alertChannel, company, confirmAlertChannel, confirmKeywords, keywords, reset, setCompany, step])

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export function useOnboarding(): OnboardingContextValue {
  const value = useContext(OnboardingContext)
  if (!value) throw new Error('useOnboarding debe usarse dentro de OnboardingProvider')
  return value
}
