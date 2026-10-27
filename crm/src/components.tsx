import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FormEvent, ReactNode } from 'react'
import { useCRM } from './crm-context'

const paths: Record<string, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 20v-7h6v7" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-3-5" /></>,
  company: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3" /></>,
  deals: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V3h8v4M3 12h18M10 12v3h4v-3" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18M7 15h2m3 0h2m3 0h1M7 18h2" /></>,
  file: <><path d="M14 3H5v18h14V8zM14 3v6h5M8 13h8m-8 4h5" /></>,
  box: <><path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5m-9 5v9M7 5l10 5" /></>,
  settings: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" /></>,
  search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
  plus: <path d="M12 4v16M4 12h16" />, arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />, check: <path d="m5 12 4 4L20 5" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  radar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="m12 12 6-7" /><circle cx="12" cy="12" r="1" /></>,
  list: <path d="M7 6h14M7 12h14M7 18h14M3 6h.1M3 12h.1M3 18h.1" />,
  board: <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="12" rx="1" /><rect x="17" y="4" width="4" height="14" rx="1" /></>,
}
export function Icon({ name, size = 18 }: { name: string; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.file}</svg> }
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span> }
export function Empty({ title = 'No hay resultados', children }: { title?: string; children?: ReactNode }) { return <div className="empty"><Icon name="search" size={28} /><h3>{title}</h3><p>{children ?? 'Prueba con otros filtros o agrega un nuevo registro.'}</p></div> }
export function PageHead({ eyebrow = 'ESPACIO COMERCIAL', title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) {
  return <div className="page-head"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div><div className="head-actions">{children}</div></div>
}
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current, trigger = document.activeElement
    dialog?.showModal()
    return () => { dialog?.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus() }
  }, [])
  return createPortal(<dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={event => { event.preventDefault(); onClose() }} aria-labelledby="dialog-title" onKeyDown={event => {
    if (event.key !== 'Tab') return
    const elements = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, a[href], [tabindex]')]
      .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0)
    const first = elements[0], last = elements.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }}>
    <header><div><p className="eyebrow">LICIHUB CRM</p><h2 id="dialog-title">{title}</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button></header>
    {children}
  </dialog>, document.body)
}
export function CommandForm({ operation, children, onClose, prepare, label = 'Guardar' }: {
  operation: string; children: ReactNode; onClose: () => void; prepare: (data: FormData) => unknown; label?: string;
}) {
  const { command } = useCRM()
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const requestId = useRef(crypto.randomUUID())
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    try { await command(operation, prepare(new FormData(event.currentTarget)), requestId.current); onClose() }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <form onSubmit={e => void submit(e)}><div className="form-body">{children}{error && <p className="error" role="alert">{error}</p>}</div>
    <footer><button type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="primary" disabled={busy}>{busy ? 'Guardando…' : label}</button></footer></form>
}
