import type { Sesion } from '../../types/models'

export const TELEGRAM_BOT =
  (import.meta.env.VITE_TELEGRAM_BOT_URL as string | undefined) || 'https://t.me/licihub_asist_bot'

export const REGISTRO = '/ingresar?modo=registro'

export function registroConPlan(plan?: string): string {
  return plan ? `${REGISTRO}&plan=${plan}` : REGISTRO
}

export function panelDe(sesion: Sesion | null): string {
  if (sesion?.rol === 'admin') return '/comercial/admin'
  if (sesion?.rol === 'commercial') return '/comercial'
  return '/app/descubrimiento'
}

export function esCliente(sesion: Sesion | null): boolean {
  return !!sesion && sesion.rol !== 'admin' && sesion.rol !== 'commercial'
}
