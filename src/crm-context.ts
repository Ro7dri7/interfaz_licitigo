import { createContext, useContext } from 'react'
import type { Session, Snapshot } from './types'

interface Store {
  snapshot: Snapshot; session: Session; now: number; refresh: () => Promise<void>;
  command: (operation: string, payload: unknown, requestId?: string) => Promise<void>;
}
export const Context = createContext<Store | null>(null)
export function useCRM() { const value = useContext(Context); if (!value) throw new Error('CRM no inicializado'); return value }

