import { createContext, useContext } from 'react'
import { defaultPrefs, type A11yPrefs } from './prefs.mjs'

export interface SpeechControls {
  /** false si el navegador no tiene speechSynthesis. */
  supported: boolean
  speaking: boolean
  paused: boolean
  voiceName: string
  /** Lee el contenido principal de la vista (o el diálogo abierto). */
  readPage(): void
  /** Reproducir / pausar. */
  toggle(): void
  stop(): void
  speak(text: string): void
}

export interface AccessibilityValue {
  prefs: A11yPrefs
  /** Tema efectivo (resuelve «Sistema» con prefers-color-scheme). */
  dark: boolean
  setPrefs(patch: Partial<A11yPrefs>, announcement?: string): void
  reset(): void
  isOpen: boolean
  openPanel(): void
  closePanel(): void
  speech: SpeechControls
  /** Mensaje para lectores de pantalla (región aria-live="polite"). */
  announce(message: string): void
}

const noop = () => {}

const fallback: AccessibilityValue = {
  prefs: defaultPrefs(),
  dark: false,
  setPrefs: noop,
  reset: noop,
  isOpen: false,
  openPanel: noop,
  closePanel: noop,
  speech: { supported: false, speaking: false, paused: false, voiceName: '', readPage: noop, toggle: noop, stop: noop, speak: noop },
  announce: noop,
}

export const AccessibilityContext = createContext<AccessibilityValue>(fallback)

/** Preferencias de apariencia y accesibilidad. Fuera del provider devuelve valores neutros. */
export function useAccessibility(): AccessibilityValue {
  return useContext(AccessibilityContext)
}
