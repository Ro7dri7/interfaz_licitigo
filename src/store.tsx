import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, Snapshot } from './types'
import { ApiError, api, fetchWorkspace } from './api'
import { Context } from './crm-context'

export function CRMProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState('')
  const [login, setLogin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer) }, [])
  const refresh = useCallback(async () => {
    const next = await fetchWorkspace()
    setSession(next.session); setSnapshot(current => !current || next.snapshot.revision >= current.revision ? next.snapshot : current); setError(''); setLogin(false)
  }, [])
  const load = useCallback(() => refresh().catch((e: unknown) => {
    setError((e as Error).message); setLogin(e instanceof ApiError && e.status === 401)
  }).finally(() => setLoading(false)), [refresh])
  useEffect(() => {
    let active = true
    void fetchWorkspace().then(next => {
      if (active) { setSession(next.session); setSnapshot(next.snapshot) }
    }).catch((e: unknown) => {
      if (active) { setError((e as Error).message); setLogin(e instanceof ApiError && e.status === 401) }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!session || login) return
    const update = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const timer = window.setInterval(update, 30000)
    window.addEventListener('focus', update)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update) }
  }, [session, login, load])
  async function command(operation: string, payload: unknown, requestId: string = crypto.randomUUID()) {
    try {
      const next = await api<Snapshot>('commands', { operation, payload, requestId, revision: snapshot?.revision })
      setSnapshot(current => !current || next.revision >= current.revision ? next : current)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) await refresh()
      if (e instanceof ApiError && e.status === 401) { setLogin(true); setSnapshot(null) }
      throw e
    }
  }
  if (login) return <div className="access-page"><form className="panel access-card" onSubmit={async e => {
    e.preventDefault(); const fields = new FormData(e.currentTarget); setLoading(true); setError('')
    try { await api('login', Object.fromEntries(fields)); await refresh() } catch (err) { setError((err as Error).message) } finally { setLoading(false) }
  }}><div className="brand">LiciHub<span>.</span> <small>CRM</small></div><h1>Tu espacio comercial</h1><p>Ingresa con una cuenta habilitada para el equipo.</p>
    <label>Correo<input name="email" type="email" autoComplete="username" required /></label><label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
    {error && <p role="alert" className="error">{error}</p>}<button className="primary" disabled={loading}>{loading ? 'Ingresando…' : 'Ingresar'}</button></form></div>
  if (!snapshot || !session) return <div className="access-page"><div className="panel access-card" aria-busy={loading}>
    <div className="brand">LiciHub<span>.</span> <small>CRM</small></div><h1>{loading ? 'Preparando tu espacio…' : 'No pudimos cargar el CRM'}</h1>
    {loading ? <div className="skeleton" /> : <><p role="alert">{error}</p><button className="primary" onClick={() => { setLoading(true); void load() }}>Reintentar conexión</button></>}
  </div></div>
  return <Context.Provider value={{ snapshot, session, command, refresh, now }}>{children}</Context.Provider>
}
