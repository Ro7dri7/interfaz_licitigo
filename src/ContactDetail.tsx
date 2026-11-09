import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Empty, Icon } from './components'
import { ContactForm } from './Forms'
import { useCRM } from './crm-context'
import { dateLabel, dateTime, initials, kindLabels, money, originLabel, quoteStatusLabels, stages } from './types'
import { whatsappNumber } from './utils'

export default function ContactDetail() {
  const { id } = useParams(), { snapshot: { data } } = useCRM(), [editing, setEditing] = useState(false)
  const contact = data.contacts.find(c => c.id === id)
  if (!contact) return <Empty title="Contacto no encontrado"><Link to="/contactos">Volver a contactos</Link></Empty>
  const company = data.companies.find(c => c.id === contact.companyId)
  const deals = data.deals.filter(d => d.companyId === contact.companyId)
  const own = deals.filter(d => d.contactId === contact.id), others = deals.filter(d => d.contactId !== contact.id)
  const ownIds = new Set(own.map(d => d.id))
  const quotes = data.quotes.filter(q => ownIds.has(q.dealId)), requests = data.prospects.filter(p => p.contactId === contact.id)
  const activities = data.activities.filter(a => ownIds.has(a.dealId)).slice().reverse().slice(0, 12)
  const colleagues = data.contacts.filter(c => c.companyId === contact.companyId && c.id !== contact.id)
  const advisors = [...new Set(deals.map(d => d.owner))].filter(owner => owner !== 'Sin asignar')
  const wa = contact.phone ? whatsappNumber(contact.phone) : ''
  const dealRow = (d: typeof deals[number]) => <Link className="context-item deal-link" to={`/negocios/${d.id}`} key={d.id}>
    <div className="badge-row"><Badge tone="blue">{stages.find(s => s.id === d.stage)?.name}</Badge><Badge>{originLabel(d.origin)}</Badge></div>
    <h3>{d.service}</h3><p>{d.amount ? money(d.amount) : 'Por cotizar'} · {d.owner} · Creado {dateLabel(d.createdAt)}</p></Link>
  return <><div className="breadcrumb"><Link to="/contactos">Contactos</Link><span>/</span><span>{contact.name}</span></div>
    <div className="detail-grid"><aside className="panel detail-properties"><div className="detail-title"><div className="company-icon">{initials(contact.name)}</div><p className="eyebrow">CONTACTO</p><h1>{contact.name}</h1>
      <p>{company ? <Link className="text-link" to={`/directorio/empresas/${company.id}`}>{company.name}</Link> : 'Sin empresa'}</p></div>
      <div className="quick-actions" role="group" aria-label="Contactar">
        {contact.phone ? <a className="button-link" href={`tel:${contact.phone}`}><Icon name="phone" />Llamar</a> : <button disabled><Icon name="phone" />Llamar</button>}
        {contact.email ? <a className="button-link" href={`mailto:${contact.email}`}><Icon name="mail" />Correo</a> : <button disabled><Icon name="mail" />Correo</button>}
        {wa ? <a className="button-link" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"><Icon name="chat" />WhatsApp</a> : <button disabled><Icon name="chat" />WhatsApp</button>}</div>
      <h2>Datos del contacto</h2><dl className="properties"><div><dt>Correo</dt><dd>{contact.email || 'Sin correo'}</dd></div><div><dt>Teléfono</dt><dd>{contact.phone || 'Sin teléfono'}</dd></div>
        <div><dt>Empresa</dt><dd>{company?.name ?? '—'}</dd></div><div><dt>RUC</dt><dd className="mono">{company?.ruc || 'Por completar'}</dd></div>
        <div><dt>Asesores</dt><dd>{advisors.join(', ') || 'Sin asignar'}</dd></div></dl>
      <p><button type="button" onClick={() => setEditing(true)}>Editar contacto</button></p></aside>
      <div className="detail-center"><section className="panel" aria-label="Negocios del contacto"><div className="section-head"><h2>Negocios de este contacto <span>({own.length})</span></h2></div>
        {own.map(dealRow)}{!own.length && <p className="hint pad">Este contacto aún no es la persona de contacto de ningún negocio.</p>}</section>
        {others.length > 0 && <section className="panel" aria-label="Otros negocios de la empresa"><div className="section-head"><h2>Otros negocios de la empresa <span>({others.length})</span></h2></div>{others.map(dealRow)}</section>}
        <section className="panel" aria-label="Actividad del contacto"><div className="section-head"><h2>Actividad reciente</h2></div>
          <div className="timeline">{activities.map(a => <article key={a.id}><span className="timeline-dot"><Icon name="file" size={13} /></span><div><p>{a.text}</p><small>{a.actor} · {dateTime(a.createdAt)}</small></div></article>)}
            {!activities.length && <Empty title="Sin actividad todavía">La actividad de sus negocios aparecerá aquí.</Empty>}</div></section></div>
      <aside className="detail-aside"><section className="panel"><div className="section-head"><h2>Cotizaciones <span>({quotes.length})</span></h2></div><div className="aside-content">
        {quotes.slice().reverse().map(q => <Link className="quote-mini" key={q.id} to={`/negocios/${q.dealId}`}><strong>{q.number} <span>v{q.version}</span></strong><p>{money(q.total)}</p><Badge tone={q.status === 'accepted' ? 'green' : ''}>{quoteStatusLabels[q.status]}</Badge></Link>)}
        {!quotes.length && <p className="hint">Sin cotizaciones para este contacto.</p>}</div></section>
        <section className="panel"><div className="section-head"><h2>Solicitudes <span>({requests.length})</span></h2></div><div className="aside-content">
          {requests.map(p => <div className="contact-block" key={p.id}><strong>{kindLabels[p.kind]}</strong><p>{p.service} · {originLabel(p.origin)}</p><small>{dateTime(p.createdAt)}</small></div>)}
          {!requests.length && <p className="hint">Sin solicitudes registradas.</p>}</div></section>
        <section className="panel" aria-label="Otros contactos de la empresa"><div className="section-head"><h2>Otros contactos de la empresa <span>({colleagues.length})</span></h2></div><div className="aside-content">
          {colleagues.map(c => <Link className="contact-block" key={c.id} to={`/contactos/${c.id}`}><span className="avatar">{initials(c.name)}</span><strong>{c.name}</strong><p>{c.email || 'Sin correo'}</p></Link>)}
          {!colleagues.length && <p className="hint">Es la única persona registrada en esta empresa.</p>}</div></section></aside></div>
    {editing && <ContactForm contact={contact} onClose={() => setEditing(false)} />}</>
}
