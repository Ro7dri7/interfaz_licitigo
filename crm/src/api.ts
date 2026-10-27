import type { Session, Snapshot } from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export async function fetchWorkspace() {
  const session = await api<Session>('session')
  const snapshot = await api<Snapshot>('state')
  return { session, snapshot }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/crm/${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch { throw new ApiError(0, 'No se pudo conectar. Comprueba que la API esté encendida e inténtalo de nuevo.') }
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { detail?: unknown }
    throw new ApiError(response.status, typeof error.detail === 'string' ? error.detail : 'No se pudo completar la operación.')
  }
  return response.json() as Promise<T>
}
