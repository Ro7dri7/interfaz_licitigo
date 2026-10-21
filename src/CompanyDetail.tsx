import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Badge, Empty, Icon, PageHead } from './components'
import { useCRM } from './crm-context'
import QuoteDocument from './QuoteDocument'
import { dateLabel, money, openDeal, originLabel, quoteStatusLabels, stages } from './types'
import type { Quote } from './types'

export default function CompanyDetail() {
  const { id } = useParams(), location = useLocation(), { snapshot: { data } } = useCRM()
  const [quote, setQuote] = useState<Quote | null>(null)
  const from = location.state?.from
  const back = typeof from === 'string' && /^\/directorio(?:\?|$)/.test(from) ? from : '/directorio'
  const company = data.companies.find(c => c.id === id)
  if (!company) return <Empty title="Empresa no encontrada"><Link to="/directorio">Volver al directorio</Link></Empty>
  const contacts = data.contacts.filter(c => c.companyId === company.id), deals = data.deals.filter(d => d.companyId === company.id)
  const dealIds = new Set(deals.map(d => d.id)), quotes = data.quotes.filter(q => dealIds.has(q.dealId)).slice().reverse()
  const active = deals.filter(openDeal)
  return <><Link className="association-link" to={back}><Icon name="arrow" size={14} />Volver al directorio</Link>
    <PageHead title={company.name} eyebrow="DIRECTORIO · FICHA DE EMPRESA" description={`RUC ${company.ruc || 'por completar'} · ${originLabel(company.origin)} · Registrada el ${dateLabel(company.createdAt)}`} />
    <section className="company-summary" aria-label="Resumen de la empresa">
      <div><small>Contactos</small><strong>{contacts.length}</strong></div><div><small>Negocios abiertos</small><strong>{active.length}</strong></div>
      <div><small>Valor comercial abierto</small><strong>{money(active.reduce((sum, d) => sum + d.amount, 0))}</strong></div>
      <div><small>Versiones de cotización</small><strong>{quotes.length}</strong></div>
    </section>
    <div className="company-sections">
      <section className="panel" aria-label="Contactos de la empresa"><div className="section-head"><div><h2>Contactos</h2><p>Personas asociadas a esta organización.</p></div><Badge>{contacts.length}</Badge></div>
        <div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th></tr></thead><tbody>{contacts.map(c => <tr key={c.id}><td><strong>{c.name}</strong></td><td>{c.email || 'Sin correo'}</td><td>{c.phone || 'Sin teléfono'}</td></tr>)}</tbody></table></div>
        {!contacts.length && <Empty title="Sin contactos registrados">Esta empresa todavía no tiene personas asociadas.</Empty>}</section>
      <section className="panel" aria-label="Negocios de la empresa"><div className="section-head"><div><h2>Negocios</h2><p>Oportunidades abiertas y cerradas de esta empresa.</p></div><Badge>{deals.length}</Badge></div>
        <div className="table-wrap"><table><thead><tr><th>Servicio</th><th>Etapa</th><th>Asesor</th><th>Valor comercial</th></tr></thead><tbody>{deals.map(d => <tr key={d.id}>
          <td><Link className="record-button" to={`/negocios/${d.id}`}>{d.service}</Link></td><td><Badge>{stages.find(s => s.id === d.stage)?.name}</Badge></td><td>{d.owner}</td><td>{money(d.amount)}</td></tr>)}</tbody></table></div>
        {!deals.length && <Empty title="Sin negocios registrados">El interés de la empresa se conserva en Prospectos hasta confirmar una oportunidad.</Empty>}</section>
      <section className="panel" aria-label="Cotizaciones de la empresa"><div className="section-head"><div><h2>Cotizaciones</h2><p>Versiones históricas de los negocios asociados.</p></div><Badge>{quotes.length}</Badge></div>
        <div className="table-wrap"><table><thead><tr><th>Propuesta</th><th>Negocio</th><th>Estado</th><th>Vigencia</th><th>Total</th></tr></thead><tbody>{quotes.map(q => <tr key={q.id}>
          <td><button className="record-button" onClick={() => setQuote(q)}>{q.number}</button><small>Versión {q.version} · {q.items.length} {q.items.length === 1 ? 'partida' : 'partidas'}</small></td>
          <td><Link to={`/negocios/${q.dealId}`}>{data.deals.find(d => d.id === q.dealId)?.service}</Link></td><td><Badge tone={q.status === 'accepted' ? 'green' : q.status === 'sent' ? 'blue' : ''}>{quoteStatusLabels[q.status]}</Badge></td><td>{dateLabel(q.validUntil)}</td><td><strong>{money(q.total)}</strong></td></tr>)}</tbody></table></div>
        {!quotes.length && <Empty title="Sin cotizaciones registradas">Abre un negocio para preparar la primera propuesta.</Empty>}</section>
    </div>{quote && <QuoteDocument quote={quote} onClose={() => setQuote(null)} />}</>
}
