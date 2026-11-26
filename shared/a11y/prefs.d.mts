export const STORAGE_KEY: string
export const SCALES: number[]
export const RATES: number[]

export interface A11yPrefs {
  theme: 'system' | 'light' | 'dark'
  scale: number
  highlight: boolean
  reader: boolean
  readOnFocus: boolean
  rate: number
}

export function defaultPrefs(): A11yPrefs
export function normalizePrefs(raw: unknown): A11yPrefs
export function loadPrefs(storage: Pick<Storage, 'getItem'>): A11yPrefs
export function savePrefs(storage: Pick<Storage, 'setItem'>, prefs: Partial<A11yPrefs>): A11yPrefs
export function resolveDark(theme: A11yPrefs['theme'], prefersDark: boolean): boolean
export function stepScale(scale: number, dir: number): number
export function applyPrefs(root: HTMLElement, prefs: A11yPrefs, prefersDark: boolean): boolean
export function currentScale(doc?: Document): number
