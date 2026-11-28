import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FormEvent, ReactNode } from 'react'
import { useCRM } from './crm-context'
import { overlayRoot } from './overlay'

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
  plus: <path d="M12 4v16M4 12h16" />, arrow: <path d="M4 12h16m-6-6 6 6-6 6" />, back: <path d="M20 12H4m6-6-6 6 6 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />, check: <path d="m5 12 4 4L20 5" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  radar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="m12 12 6-7" /><circle cx="12" cy="12" r="1" /></>,
  list: <path d="M7 6h14M7 12h14M7 18h14M3 6h.1M3 12h.1M3 18h.1" />,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  chat: <path d="M4 20l1.5-4A8 8 0 1 1 8 18.5z" />,
  filter: <path d="M4 5h16l-6 8v6l-4-2v-4z" />,
  upload: <path d="M12 15V3m-5 5 5-5 5 5M4 20h16" />,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 20h16" />,
  chevron: <path d="m6 9 6 6 6-6" />, chart: <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />, tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1" /></>,
  board: <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="12" rx="1" /><rect x="17" y="4" width="4" height="14" rx="1" /></>,
}
export function Icon({ name, size = 18 }: { name: string; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.file}</svg> }
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span> }
export function Empty({ title = 'No hay resultados', children }: { title?: string; children?: ReactNode }) { return <div className="empty"><Icon name="search" size={28} /><h3>{title}</h3><p>{children ?? 'Prueba con otros filtros o agrega un nuevo registro.'}</p></div> }
export function PageHead({ eyebrow = 'ESPACIO COMERCIAL', title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) {
  return <div className="page-head"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div><div className="head-actions">{children}</div></div>
}
export function Modal({ title, description, children, onClose, wide = false, drawer = false, className = '' }: {
  title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean; drawer?: boolean; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current, trigger = document.activeElement
    dialog?.showModal()
    // showModal enfoca el primer control (el botón Cerrar); un formulario puede pedir empezar en su primer campo.
    dialog?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => { dialog?.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus() }
  }, [])
  return createPortal(<dialog ref={ref} className={['modal', wide && 'wide', drawer && 'drawer', className].filter(Boolean).join(' ')} onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }} aria-labelledby="dialog-title" aria-describedby={description ? 'dialog-description' : undefined} onKeyDown={event => {
    if (event.key !== 'Tab') return
    const elements = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, a[href], [tabindex]')]
      .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0)
    const first = elements[0], last = elements.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }}>
    <header><div><p className="eyebrow">LICIHUB CRM</p><h2 id="dialog-title">{title}</h2>{description && <p id="dialog-description" className="dialog-description">{description}</p>}</div><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button></header>
    {children}
  </dialog>, overlayRoot())
}
/**
 * Formulario que envía un comando del CRM. `another` agrega el botón «… y agregar otro» (como en HubSpot):
 * guarda, limpia el formulario y lo deja abierto con un nuevo identificador de solicitud.
 */
export function CommandForm({ operation, children, onClose, prepare, label = 'Guardar', another, savedMessage = 'Guardado.', onReset }: {
  operation: string; children: ReactNode; onClose: () => void; prepare: (data: FormData) => unknown; label?: string;
  another?: string; savedMessage?: string; onReset?: () => void;
}) {
  const { command } = useCRM()
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const requestId = useRef(crypto.randomUUID())
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget, again = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-another') === 'true'
    setBusy(true); setError(''); setNotice('')
    try {
      await command(operation, prepare(new FormData(form)), requestId.current)
      if (!again) { onClose(); return }
      // Un registro nuevo necesita su propio identificador; reutilizarlo devolvería el guardado anterior.
      requestId.current = crypto.randomUUID()
      form.reset(); setNotice(savedMessage)
      form.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea')?.focus()
    }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <form onSubmit={e => void submit(e)} onReset={onReset}><div className="form-body">{notice && <p className="notice" role="status">{notice}</p>}{children}{error && <p className="error" role="alert">{error}</p>}</div>
    <footer><button type="button" onClick={onClose} disabled={busy}>Cancelar</button>{another && <button type="submit" data-another="true" disabled={busy}>{another}</button>}<button type="submit" className="primary" disabled={busy}>{busy ? 'Guardando…' : label}</button></footer></form>
}
