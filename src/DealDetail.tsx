import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Empty, Icon } from './components'
import { DealForm } from './Forms'
import { useCRM } from './crm-context'
import { originLabel, dateLabel, dateTime, evidenceLabels, initials, kindLabels, money, stages, quoteStatusLabels } from './types'
import type { Quote } from './types'
import { QuotePreview } from './Operations'

export default function DealDetail() {
  const { id } = useParams(), { snapshot, session, command, now } = useCRM()
  const data = snapshot.data
  const quotesReady = session.mode === 'demo' || (snapshot.schemaVersion ?? 1) >= 2
  const [form, setForm] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('all'), [quote, setQuote] = useState<Quote | null>(null)
  const deal = data.deals.find(d => d.id === id)
  if (!deal) return <Empty title="Negocio no encontrado"><Link to="/negocios">Volver a negocios</Link></Empty>
  const company = data.companies.find(c => c.id === deal.companyId), contacts = data.contacts.filter(c => c.companyId === deal.companyId)
  const prospects = data.prospects.filter(p => deal.prospectIds.includes(p.id)), context = prospects.filter(p => p.tender || p.evidence !== 'none')
  const activities = data.activities.filter(a => a.dealId === deal.id && (filter === 'all' || a.kind === filter)).slice().reverse()
  const tasks = data.tasks.filter(t => t.dealId === deal.id), quotes = data.quotes.filter(q => q.dealId === deal.id)
  return <><div className="breadcrumb"><Link to="/negocios">Negocios</Link><span>/</span><Link to={`/directorio/empresas/${deal.companyId}`}>{company?.name}</Link></div>
    <div className="detail-grid"><aside className="panel detail-properties"><div className="detail-title"><div className="company-icon"><Icon name="company" size={25} /></div><p className="eyebrow">{originLabel(deal.origin).toUpperCase()} · CERTIFICACIONES</p><h1>{company?.name}</h1><p>{deal.service}</p></div>
      <div className="deal-value"><small>Valor comercial</small><strong>{deal.amount ? money(deal.amount) : 'Por cotizar'}</strong></div>
      <label className="stage-label">Etapa del negocio<select aria-label="Etapa del negocio" value={deal.stage} disabled={busy} onChange={async e => {
        const stage = e.target.value
        if (stage === 'lost') { setForm('lost'); return }
        setBusy(true); setError(''); try { await command('stage', { dealId: deal.id, stage }) } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
      }}>{stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="quick-actions"><button onClick={() => setForm('activity')}><Icon name="file" />Actividad</button><button onClick={() => setForm('task')}><Icon name="calendar" />Tarea</button><button onClick={() => setForm('quote')} disabled={!quotesReady || ['won', 'lost'].includes(deal.stage)}><Icon name="plus" />Cotizar</button></div>
      <h2>Propiedades del negocio</h2>{!quotesReady && <p className="hint">Actualización pendiente: ejecuta 006_cotizaciones_multiples.sql para habilitar las nuevas propuestas.</p>}<dl className="properties"><div><dt>Responsable</dt><dd><span className="avatar small">{initials(deal.owner)}</span>{deal.owner}</dd></div>
        <div><dt>Origen</dt><dd>{originLabel(deal.origin)}</dd></div><div><dt>RUC</dt><dd className="mono">{company?.ruc || 'Por completar'}</dd></div><div><dt>Creado</dt><dd>{dateLabel(deal.createdAt)}</dd></div>
        <div><dt>Moneda</dt><dd>PEN · Sol peruano</dd></div>{deal.lossReason && <div><dt>Motivo de pérdida</dt><dd>{deal.lossReason}</dd></div>}</dl>
      <p className="hint">El valor comercial corresponde al servicio cotizado, independiente del monto de la licitación.</p>
    </aside><div className="detail-center"><section className="panel"><div className="section-head"><h2>Resumen del negocio</h2><Badge tone={deal.stage === 'won' ? 'green' : 'blue'}>{stages.find(s => s.id === deal.stage)?.name}</Badge></div>
      <div className="summary-content"><div><small>RELACIÓN COMERCIAL</small><p>{company?.name}</p></div><div><small>SOLICITUDES Y SEÑALES</small><div className="badge-row">{[...new Set(prospects.map(p => p.kind))].map(k => <Badge key={k} tone={k === 'signal' ? 'amber' : 'blue'}>{kindLabels[k]}</Badge>)}</div></div></div></section>
      <section className="panel context-panel"><div className="section-head"><h2><Icon name="radar" /> Contexto LiciHub</h2><span className="tiny-label">INTELIGENCIA COMERCIAL</span></div>
        {context.length ? context.map(p => <div className="context-item" key={p.id}><Badge tone={p.evidence === 'required' ? 'amber' : 'blue'}>{evidenceLabels[p.evidence]}</Badge><h3>{p.service}</h3><p>{p.tender || 'Sin licitación asociada'}</p><small>{p.deadline ? `Plazo del proceso: ${dateLabel(p.deadline)} · ` : ''}Registrado {dateLabel(p.createdAt)}</small>{p.notes && <p>{p.notes}</p>}</div>) : <div className="context-item"><p>Este negocio llegó por {originLabel(deal.origin)}. Puede gestionarse sin una licitación asociada.</p></div>}
        <p className="context-note">Valida con el cliente qué certificaciones posee. Un requisito o recomendación no confirma una carencia.</p></section>
      <section className="panel"><div className="section-head"><h2>Historial de actividades</h2><button onClick={() => setForm('activity')}><Icon name="plus" /> Registrar</button></div>
        <div className="activity-filters">{[['all', 'Todo'], ['note', 'Notas'], ['call', 'Llamadas'], ['task', 'Tareas'], ['stage', 'Etapas']].map(([value, label]) => <button key={value} aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>
        <div className="timeline">{activities.map(a => <article key={a.id}><span className="timeline-dot"><Icon name={a.kind === 'task' ? 'check' : a.kind === 'stage' ? 'arrow' : 'file'} size={13} /></span><div><p>{a.text}</p><small>{a.actor} · {dateTime(a.createdAt)}</small></div></article>)}{!activities.length && <Empty title="Sin actividades de este tipo" />}</div></section>
    </div><aside className="detail-aside"><section className="panel"><div className="section-head"><h2>Próximas acciones</h2><button className="icon-button" aria-label="Agregar tarea" onClick={() => setForm('task')}><Icon name="plus" /></button></div>
      <div className="aside-content">{tasks.filter(t => !t.done).map(t => <div className="aside-task" key={t.id}><strong>{t.title}</strong><small className={new Date(t.dueAt).getTime() < now ? 'amber-text' : ''}>{dateTime(t.dueAt)}</small><button className="text-button" disabled={busy} onClick={async () => {
        setBusy(true); setError(''); try { await command('complete_task', { taskId: t.id }) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
      }}>Marcar completada</button></div>)}{!tasks.some(t => !t.done) && <p className="hint">Sin acciones pendientes. Programa el siguiente contacto.</p>}</div></section>
      <section className="panel"><div className="section-head"><h2>Contactos <span>({contacts.length})</span></h2></div><div className="aside-content">{contacts.map(c => <div className="contact-block" key={c.id}><span className="avatar">{initials(c.name)}</span><strong>{c.name}</strong><p>{c.email || 'Sin correo'}</p><p>{c.phone || 'Sin teléfono'}</p></div>)}{!contacts.length && <p className="hint">Contacto pendiente de completar.</p>}</div></section>
      <section className="panel"><div className="section-head"><h2>Cotizaciones <span>({quotes.length})</span></h2></div><div className="aside-content">{quotes.slice().reverse().map(q => <button className="quote-mini" key={q.id} onClick={() => setQuote(q)}><strong>{q.number} <span>v{q.version}</span></strong><p>{money(q.total)}</p><Badge tone={q.status === 'accepted' ? 'green' : ''}>{quoteStatusLabels[q.status]} · {q.items.length} partidas</Badge></button>)}{!quotes.length && <p className="hint">Prepara una propuesta usando el catálogo.</p>}</div></section>
    </aside></div>
    {form && <DealForm deal={deal} type={form} onClose={() => setForm('')} />}{quote && <QuotePreview quote={quote} onClose={() => setQuote(null)} />}
  </>
}
