import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Icon } from './components'
import { useCRM } from './crm-context'
import { dateLabel, dateTime, initials, money, originLabel, priorityLabels, stages } from './types'
import type { Deal } from './types'
import { whatsappNumber } from './utils'

const activityLabels: Record<string, string> = { note: 'Nota', call: 'Llamada', meeting: 'Reunión', task: 'Tarea', stage: 'Etapa', created: 'Creado', request: 'Solicitud', signal: 'Señal', qualification: 'Calificación', quote: 'Cotización' }
const activityIcons: Record<string, string> = { note: 'file', call: 'phone', meeting: 'users', task: 'check', stage: 'arrow', created: 'plus', request: 'mail' }

function Section({ title, count, action, children }: { title: string; count?: number; action?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return <section className="pv-section"><header><button type="button" className="pv-toggle" aria-expanded={open} onClick={() => setOpen(v => !v)}>
    <Icon name="chevron" size={14} />{title}{count !== undefined && <span>({count})</span>}</button>{action}</header>{open && <div className="pv-body">{children}</div>}</section>
}

const go = (href: string) => { if (href.startsWith('http')) window.open(href, '_blank', 'noopener,noreferrer'); else window.location.assign(href) }

const Field = ({ label, children }: { label: string; children: ReactNode }) => <div className="pv-field"><dt>{label}</dt><dd>{children}</dd></div>

// Vista previa lateral de un negocio: resume lo importante sin salir del tablero.
export default function DealPreview({ deal, sla, onClose, onForm }: { deal: Deal; sla: string; onClose: () => void; onForm: (type: string) => void }) {
  const { snapshot: { data }, now } = useCRM()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const company = data.companies.find(c => c.id === deal.companyId), stage = stages.find(s => s.id === deal.stage)
  const people = data.contacts.filter(c => c.companyId === deal.companyId).sort((a, b) => Number(b.id === deal.contactId) - Number(a.id === deal.contactId))
  const person = people[0], wa = person?.phone ? whatsappNumber(person.phone) : ''
  const nextTask = data.tasks.filter(t => t.dealId === deal.id && !t.done).sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0]
  const quote = data.quotes.filter(q => q.dealId === deal.id).at(-1)
  const activities = data.activities.filter(a => a.dealId === deal.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const priority = deal.priority ?? 'normal'
  const quick: [string, string, string, () => void, boolean, string][] = [
    ['Nota', 'file', 'Registrar una nota o actividad', () => onForm('activity'), true, ''],
    ['Tarea', 'calendar', 'Programar una tarea', () => onForm('task'), true, ''],
    ['Correo', 'mail', person?.email ?? '', () => go(`mailto:${person?.email}`), Boolean(person?.email), 'El contacto no tiene correo'],
    ['Llamada', 'phone', person?.phone ?? '', () => go(`tel:${person?.phone.replace(/[^\d+]/g, '')}`), Boolean(person?.phone), 'El contacto no tiene teléfono'],
    ['WhatsApp', 'chat', person?.phone ?? '', () => go(`https://wa.me/${wa}`), Boolean(wa), 'El contacto no tiene teléfono'],
  ]
  const closeMenu = (e: React.MouseEvent<HTMLElement>) => e.currentTarget.closest('details')?.removeAttribute('open')

  return <aside className="deal-preview" aria-label="Vista previa del negocio">
    <header className="pv-head"><h2>Vista previa</h2><button type="button" className="icon-button" aria-label="Cerrar vista previa" onClick={onClose}><Icon name="close" /></button></header>
    <div className="pv-bar"><Link className="pv-link" to={`/negocios/${deal.id}`}>Ver registro</Link>
      <details className="pv-menu"><summary>Acciones <Icon name="chevron" size={13} /></summary><div className="pv-menu-list">
        <button type="button" onClick={e => { closeMenu(e); onForm('details') }}>Editar prioridad y cierre</button>
        <button type="button" onClick={e => { closeMenu(e); onForm('activity') }}>Registrar actividad</button>
        <button type="button" onClick={e => { closeMenu(e); onForm('task') }}>Programar tarea</button>
        <button type="button" onClick={e => { closeMenu(e); onForm('contact') }}>Agregar contacto</button>
        <Link to={`/directorio/empresas/${deal.companyId}`}>Ir a la ficha de empresa</Link></div></details></div>
    <div className="pv-scroll">
      <div className="pv-title"><span className="pv-icon"><Icon name="deals" size={22} /></span><div><h3>{company?.name}</h3><p>{deal.service}</p><small>{originLabel(deal.origin)} · Creado {dateTime(deal.createdAt)}</small></div></div>
      <dl className="pv-props">
        <Field label="Monto">{deal.amount ? <strong>{money(deal.amount)}</strong> : 'Por cotizar'}</Field>
        <Field label="Cierre">{deal.expectedClose ? dateLabel(deal.expectedClose) : '—'}</Field>
        <Field label="Etapa"><span className="pv-stage" style={{ color: stage?.color, background: `${stage?.color}1a` }}>{stage?.name}</span></Field>
      </dl>
      <div className="pv-quick" role="group" aria-label="Acciones rápidas del negocio">{quick.map(([label, icon, hint, run, enabled, off]) =>
        <button type="button" key={label} disabled={!enabled} aria-label={label} title={enabled ? hint : off} onClick={run}><span><Icon name={icon} size={17} /></span>{label}</button>)}</div>

      <Section title="Acerca de este negocio"><dl>
        <Field label="Propietario"><span className="pv-owner"><span className="avatar small">{initials(deal.owner)}</span>{deal.owner}</span></Field>
        <Field label="Prioridad"><span className="pv-owner"><span className={`pv-dot ${priority}`} />{priorityLabels[priority]}</span></Field>
        <Field label="Seguimiento">{nextTask ? <span className={new Date(nextTask.dueAt).getTime() < now ? 'amber-text' : ''}>{nextTask.title} · {dateTime(nextTask.dueAt)}</span> : '—'}</Field>
        {sla && <Field label="Alerta"><span className="sla-chip" role="status"><Icon name="clock" size={12} />{sla}</span></Field>}
        {deal.lossReason && <Field label="Motivo de pérdida">{deal.lossReason}</Field>}</dl></Section>

      <Section title="Empresa" count={company ? 1 : 0}>{company ? <><dl>
        <Field label="Razón social">{company.name}</Field><Field label="RUC"><span className="mono">{company.ruc || 'Por completar'}</span></Field><Field label="Origen">{originLabel(company.origin)}</Field></dl>
        <Link className="pv-more" to={`/directorio/empresas/${company.id}`}>Ver ficha de empresa →</Link></> : <p className="hint">Sin empresa asociada.</p>}</Section>

      <Section title="Contacto" count={people.length} action={<button type="button" className="pv-add" onClick={() => onForm('contact')}>+ Agregar</button>}>
        {people.map(c => <div className="pv-item" key={c.id}><dl><Field label="Nombre">{c.name}</Field><Field label="Email">{c.email || '—'}</Field><Field label="Teléfono">{c.phone || '—'}</Field></dl>
          <Link className="pv-more" to={`/contactos/${c.id}`}>Ver ficha de contacto →</Link></div>)}
        {!people.length && <p className="hint">Este negocio aún no tiene contacto.</p>}</Section>

      <Section title="Productos" count={quote ? quote.items.length : 1}>
        {quote ? <><div className="pv-quote"><strong>{quote.number} <span>v{quote.version}</span></strong><Badge tone={quote.status === 'accepted' ? 'green' : ''}>{{ draft: 'Borrador', sent: 'Enviada', accepted: 'Aceptada', rejected: 'Rechazada' }[quote.status]}</Badge></div>
          {quote.items.map((item, i) => <div className="pv-item" key={`${item.productName}-${i}`}><dl><Field label="Producto">{item.productName}</Field>
            {data.products.find(p => p.id === item.productId)?.sku && <Field label="SKU"><span className="mono">{data.products.find(p => p.id === item.productId)?.sku}</span></Field>}
            <Field label="Cantidad">{item.quantity}</Field><Field label="Monto">{money(item.unitPrice * item.quantity)}</Field></dl></div>)}
          <Link className="pv-more" to={`/negocios/${deal.id}`}>Ver cotizaciones →</Link></>
          : <div className="pv-item"><dl><Field label="Servicio de interés">{deal.service}</Field><Field label="Monto">Por cotizar</Field></dl><p className="hint">Aún no hay una cotización. Prepárala desde el registro del negocio.</p></div>}</Section>

      <Section title="Actividades recientes">
        {activities.slice(0, 5).map(a => <article className="pv-activity" key={a.id}><div><span className={`pv-kind ${a.kind}`}><Icon name={activityIcons[a.kind] ?? 'file'} size={12} />{activityLabels[a.kind] ?? 'Actividad'}</span><time dateTime={a.createdAt}>{dateTime(a.createdAt)}</time></div>
          <p>{a.text}</p><small>{a.actor}</small></article>)}
        {!activities.length && <p className="hint">Sin actividades todavía. Registra la primera nota o llamada.</p>}
        {activities.length > 5 && <Link className="pv-more" to={`/negocios/${deal.id}`}>Ver las {activities.length} actividades →</Link>}</Section>
    </div>
  </aside>
}
