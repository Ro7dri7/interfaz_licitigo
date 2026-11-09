import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Empty, Icon, PageHead } from './components'
import { DealForm } from './Forms'
import ImportDeals from './ImportDeals'
import { useCRM } from './crm-context'
import { originLabel, dateLabel, dateTime, initials, money, origins, priorityLabels, stageProbability, stages } from './types'
import type { Contact, Deal, Stage } from './types'
import { downloadCsv, limaDay, whatsappNumber } from './utils'

export function Filters({ children, preserve = [] }: { children?: React.ReactNode; preserve?: string[] }) {
  const [params, setParams] = useSearchParams()
  const change = (key: string, value: string) => setParams(p => { if (value) p.set(key, value); else p.delete(key); return p }, { replace: true })
  return <div className="filters"><label className="search-field"><Icon name="search" /><input aria-label="Buscar registros" type="search" placeholder="Buscar empresa, contacto o servicio…" value={params.get('q') ?? ''} onChange={e => change('q', e.target.value)} /></label>
    <select aria-label="Filtrar por origen" value={params.get('origen') ?? ''} onChange={e => change('origen', e.target.value)}><option value="">Todos los orígenes</option>{origins.map(o => <option key={o} value={o}>{originLabel(o)}</option>)}</select>{children}
    {[...params.keys()].some(key => !preserve.includes(key)) && <button className="text-button" onClick={() => setParams(new URLSearchParams([...params].filter(([key]) => preserve.includes(key))))}>Limpiar filtros</button>}</div>
}

const orders = [['recientes', 'Más recientes'], ['antiguos', 'Más antiguos'], ['mayor', 'Mayor monto'], ['menor', 'Menor monto'], ['accion', 'Próxima acción'], ['prioridad', 'Prioridad'], ['cierre', 'Cierre esperado']]

// Reglas de seguimiento (SLA): un negocio nuevo debe atenderse dentro de 24 h y uno abierto no debe pasar 7 días sin actividad.
const HOUR = 3_600_000, DAY = 24 * HOUR, FIRST_ATTENTION = DAY, STALE_AFTER = 7 * DAY
const ageLabel = (ms: number) => ms >= DAY ? `${Math.floor(ms / DAY)} d` : `${Math.max(1, Math.floor(ms / HOUR))} h`
const rank = { high: 0, normal: 1, low: 2 }
const weighted = (deals: Deal[]) => money(Math.round(deals.reduce((sum, d) => sum + d.amount * stageProbability[d.stage], 0)))
const advancedKeys = ['prioridad', 'etapa', 'min', 'max', 'desde', 'hasta', 'atencion', 'sincontacto']

function QuickActions({ person, onForm }: { person?: Contact; onForm: (type: string) => void }) {
  const wa = person?.phone ? whatsappNumber(person.phone) : ''
  const links: [string, string, string][] = [['phone', 'Llamar', person?.phone ? `tel:${person.phone.replace(/[^\d+]/g, '')}` : ''], ['mail', 'Correo', person?.email ? `mailto:${person.email}` : ''], ['chat', 'WhatsApp', wa ? `https://wa.me/${wa}` : '']]
  const stop = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation() }
  return <div className="card-actions" role="group" aria-label="Acciones rápidas">
    {links.map(([icon, label, href]) => <button type="button" key={label} className="qa" aria-label={label} title={href ? label : `${label}: el contacto no tiene el dato`} disabled={!href}
      onClick={e => { stop(e); if (href.startsWith('http')) window.open(href, '_blank', 'noopener,noreferrer'); else window.location.href = href }}><Icon name={icon} size={14} /></button>)}
    <button type="button" className="qa" aria-label="Tarea" title="Programar tarea" onClick={e => { stop(e); onForm('task') }}><Icon name="calendar" size={14} /></button>
    <button type="button" className="qa" aria-label="Nota" title="Registrar actividad" onClick={e => { stop(e); onForm('activity') }}><Icon name="file" size={14} /></button>
  </div>
}

export function Pipeline({ onCreate }: { onCreate: () => void }) {
  const { session, snapshot: { data }, now, command } = useCRM(), [params, setParams] = useSearchParams()
  const [dragId, setDragId] = useState<string | null>(null), [over, setOver] = useState<Stage | null>(null)
  const [moving, setMoving] = useState<Record<string, Stage>>({}), [moveError, setMoveError] = useState('')
  const [lost, setLost] = useState<Deal | null>(null), [action, setAction] = useState<{ deal: Deal; type: string } | null>(null), [panel, setPanel] = useState(false), [importing, setImporting] = useState(false)
  const view = params.get('vista') ?? 'board', search = (params.get('q') ?? '').toLocaleLowerCase()
  const mine = params.get('mios') === '1', order = orders.some(([id]) => id === params.get('orden')) ? params.get('orden')! : 'recientes'
  const setParam = (key: string, value: string) => setParams(p => { if (value) p.set(key, value); else p.delete(key); return p }, { replace: true })
  const me = session.user.name.toLocaleLowerCase(), isMine = (d: Deal) => d.owner.toLocaleLowerCase() === me
  const contactOf = (d: Deal) => data.contacts.find(c => c.id === d.contactId) ?? data.contacts.find(c => c.companyId === d.companyId)
  const dueOf = new Map<string, number>()
  for (const t of data.tasks) { const due = new Date(t.dueAt).getTime(); if (!t.done && due < (dueOf.get(t.dealId) ?? Infinity)) dueOf.set(t.dealId, due) }
  const created = (d: Deal) => new Date(d.createdAt).getTime(), late = Number.MAX_SAFE_INTEGER
  const sorters: Record<string, (a: Deal, b: Deal) => number> = {
    recientes: (a, b) => created(b) - created(a), antiguos: (a, b) => created(a) - created(b),
    mayor: (a, b) => b.amount - a.amount, menor: (a, b) => a.amount - b.amount,
    accion: (a, b) => (dueOf.get(a.id) ?? late) - (dueOf.get(b.id) ?? late),
    prioridad: (a, b) => rank[a.priority ?? 'normal'] - rank[b.priority ?? 'normal'] || created(b) - created(a),
    cierre: (a, b) => (a.expectedClose ?? '9999').localeCompare(b.expectedClose ?? '9999'),
  }
  const lastTouch = new Map<string, number>()
  for (const a of data.activities) { const t = new Date(a.createdAt).getTime(); if (t > (lastTouch.get(a.dealId) ?? 0)) lastTouch.set(a.dealId, t) }
  const isOpen = (d: Deal) => !['won', 'lost'].includes(d.stage)
  const overdue = (d: Deal) => isOpen(d) && (dueOf.get(d.id) ?? Infinity) < now
  const slaOf = (d: Deal) => {
    if (!isOpen(d)) return ''
    if (d.stage === 'new' && now - created(d) > FIRST_ATTENTION) return `Sin atender · ${ageLabel(now - created(d))}`
    const idle = now - (lastTouch.get(d.id) ?? created(d))
    return idle > STALE_AFTER ? `Sin actividad · ${ageLabel(idle)}` : ''
  }
  const needsAttention = (d: Deal) => Boolean(slaOf(d)) || overdue(d)
  const num = (key: string) => params.get(key) ? Number(params.get(key)) : null, minAmount = num('min'), maxAmount = num('max'), from = params.get('desde'), to = params.get('hasta')
  const scoped = data.deals.filter(d => `${data.companies.find(c => c.id === d.companyId)?.name} ${d.service}`.toLocaleLowerCase().includes(search)
    && (!params.get('origen') || (d.origin === params.get('origen') || data.prospects.some(p => p.dealId === d.id && p.origin === params.get('origen')))) && (!params.get('etapa') || d.stage === params.get('etapa'))
    && (!params.get('responsable') || d.owner === params.get('responsable')) && (!params.get('prioridad') || (d.priority ?? 'normal') === params.get('prioridad'))
    && (minAmount === null || d.amount >= minAmount * 100) && (maxAmount === null || d.amount <= maxAmount * 100)
    && (!from || limaDay(d.createdAt) >= from) && (!to || limaDay(d.createdAt) <= to)
    && (params.get('atencion') !== '1' || needsAttention(d)) && (params.get('sincontacto') !== '1' || !contactOf(d)))
  const filtered = (mine ? scoped.filter(isMine) : scoped).slice().sort(sorters[order])
  // La tarjeta se muestra en la columna de destino mientras se guarda; si el CRM la rechaza, vuelve a su lugar.
  const stageOf = (d: Deal) => moving[d.id] ?? d.stage
  const endDrag = () => { setDragId(null); setOver(null) }
  async function move(id: string, stage: Stage) {
    const deal = data.deals.find(d => d.id === id)
    endDrag()
    if (!deal || deal.stage === stage || moving[id]) return
    setMoveError('')
    if (stage === 'lost') { setLost(deal); return }
    setMoving(m => ({ ...m, [id]: stage }))
    try { await command('stage', { dealId: id, stage }) }
    catch (e) { setMoveError(`No se movió «${deal.service}»: ${(e as Error).message}`) }
    finally { setMoving(m => { const next = { ...m }; delete next[id]; return next }) }
  }
  function exportCsv() {
    const head = ['Empresa', 'RUC', 'Servicio', 'Origen', 'Etapa', 'Valor (S/)', 'Responsable', 'Contacto', 'Correo', 'Teléfono', 'Creado', 'Próxima acción']
    const rows = filtered.map(d => {
      const company = data.companies.find(c => c.id === d.companyId), person = contactOf(d), due = dueOf.get(d.id)
      return [company?.name ?? '', company?.ruc ?? '', d.service, originLabel(d.origin), stages.find(s => s.id === d.stage)?.name ?? d.stage, (d.amount / 100).toFixed(2),
        d.owner, person?.name ?? '', person?.email ?? '', person?.phone ?? '', limaDay(d.createdAt), due ? limaDay(due) : '']
    })
    downloadCsv(`negocios-${limaDay(now)}.csv`, [head, ...rows])
  }
  const open = filtered.filter(isOpen), won = filtered.filter(d => d.stage === 'won'), closed = won.length + filtered.filter(d => d.stage === 'lost').length
  const attention = open.filter(needsAttention).length, activeAdvanced = advancedKeys.filter(key => params.get(key)).length
  const metrics = [['Cartera abierta', money(open.reduce((s, d) => s + d.amount, 0)), `${open.length} negocios abiertos`], ['Ganado', money(won.reduce((s, d) => s + d.amount, 0)), `${won.length} negocios`],
    ['Pronóstico ponderado', weighted(open), 'Según la probabilidad de cada etapa'], ['Tasa de cierre', closed ? `${Math.round(won.length / closed * 100)}%` : '—', closed ? `${won.length} de ${closed} cerrados` : 'Aún sin cierres']]
  return <><PageHead title="Negocios" description={`${filtered.length} negocios · ${money(filtered.filter(d => !['won', 'lost'].includes(d.stage)).reduce((s, d) => s + d.amount, 0))} en cartera abierta`}>
    <div className="segmented">{[['board', 'Tablero'], ['list', 'Lista']].map(([id, text]) => <button key={id} aria-pressed={view === id} className={view === id ? 'active' : ''} onClick={() => setParams(p => { p.set('vista', id); return p })}><Icon name={id} />{text}</button>)}</div>
    <button onClick={() => setImporting(true)}><Icon name="upload" size={16} /> Importar</button>
    <button onClick={exportCsv} disabled={!filtered.length}><Icon name="download" size={16} /> Exportar</button>
    <button className="primary" onClick={onCreate}><Icon name="plus" /> Nueva oportunidad</button></PageHead>
    <div className="metrics" aria-label="Resumen de negocios">{metrics.map(([name, value, hint]) => <div key={name}><small>{name}</small><strong>{value}</strong><span>{hint}</span></div>)}
      <button type="button" className={`attention ${attention ? 'alert' : ''}`} aria-pressed={params.get('atencion') === '1'} onClick={() => setParam('atencion', params.get('atencion') === '1' ? '' : '1')}><small>Requieren atención</small><strong>{attention}</strong><span>Sin atender, sin actividad o con acción vencida</span></button></div>
    <div className="tabs" role="group" aria-label="Alcance de los negocios">{[[false, 'Todos los negocios', scoped.length], [true, 'Mis negocios', scoped.filter(isMine).length]].map(([own, name, count]) =>
      <button key={String(own)} aria-pressed={mine === own} className={mine === own ? 'active' : ''} onClick={() => setParam('mios', own ? '1' : '')}>{name} <span>{count}</span></button>)}</div>
    <Filters preserve={['vista', 'mios', 'orden']}><select aria-label="Filtrar por responsable" value={params.get('responsable') ?? ''} onChange={e => setParam('responsable', e.target.value)}><option value="">Todo el equipo</option>{[...new Set(data.deals.map(d => d.owner))].map(o => <option key={o}>{o}</option>)}</select>
      <select aria-label="Ordenar negocios" value={order} onChange={e => setParam('orden', e.target.value === 'recientes' ? '' : e.target.value)}>{orders.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select>
      <button type="button" aria-expanded={panel} onClick={() => setPanel(v => !v)}><Icon name="filter" size={15} /> Filtros{activeAdvanced > 0 && <span className="count-pill">{activeAdvanced}</span>}</button></Filters>
    {panel && <section className="panel filter-panel" aria-label="Filtros avanzados"><div className="form-grid">
      <label>Prioridad<select value={params.get('prioridad') ?? ''} onChange={e => setParam('prioridad', e.target.value)}><option value="">Todas</option>{Object.entries(priorityLabels).map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>
      <label>Etapa<select value={params.get('etapa') ?? ''} onChange={e => setParam('etapa', e.target.value)}><option value="">Todas las etapas</option>{stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Valor mínimo (S/)<input type="number" min="0" step="1" value={params.get('min') ?? ''} onChange={e => setParam('min', e.target.value)} /></label>
      <label>Valor máximo (S/)<input type="number" min="0" step="1" value={params.get('max') ?? ''} onChange={e => setParam('max', e.target.value)} /></label>
      <label>Creado desde<input type="date" value={from ?? ''} onChange={e => setParam('desde', e.target.value)} /></label>
      <label>Creado hasta<input type="date" value={to ?? ''} onChange={e => setParam('hasta', e.target.value)} /></label></div>
      <div className="check-row"><label><input type="checkbox" checked={params.get('atencion') === '1'} onChange={e => setParam('atencion', e.target.checked ? '1' : '')} /> Requieren atención</label>
        <label><input type="checkbox" checked={params.get('sincontacto') === '1'} onChange={e => setParam('sincontacto', e.target.checked ? '1' : '')} /> Sin contacto</label></div></section>}
    {mine && !scoped.some(isMine) && <div className="info-strip"><Icon name="users" />No hay negocios asignados a «{session.user.name}». Los negocios se asignan por el nombre del responsable.</div>}
    {view === 'board' && <p className="board-hint">Arrastra una tarjeta a otra columna para cambiar la etapa del negocio.</p>}
    {moveError && <p className="error board-error" role="alert">{moveError}</p>}
    {view === 'board' ? <div className="board" aria-label="Tablero de negocios">{stages.filter(s => !params.get('etapa') || s.id === params.get('etapa')).map(s => {
      const deals = filtered.filter(d => stageOf(d) === s.id)
      return <section className={`board-column ${dragId && over === s.id ? 'drop-target' : ''}`} key={s.id}
        onDragOver={e => { if (!dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== s.id) setOver(s.id) }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null) }}
        onDrop={e => { e.preventDefault(); const id = dragId ?? e.dataTransfer.getData('text/plain'); if (id) void move(id, s.id) }}>
        <header><span className="status-dot" style={{ background: s.color }} /><h2>{s.name}</h2><span>{deals.length}</span></header>
        <div className="board-cards">{deals.map(d => {
          const c = data.companies.find(c => c.id === d.companyId), due = dueOf.get(d.id), person = contactOf(d), sla = slaOf(d)
          return <Link to={`/negocios/${d.id}`} className={`deal-card ${dragId === d.id ? 'dragging' : ''} ${moving[d.id] ? 'saving' : ''} ${needsAttention(d) ? 'attention' : ''}`} key={d.id} draggable
            onDragStart={e => { e.dataTransfer.setData('text/plain', d.id); e.dataTransfer.effectAllowed = 'move'; setDragId(d.id) }} onDragEnd={endDrag}>
            <div className="card-top"><span className="badge-row"><Badge tone={d.origin === 'Lici' ? 'blue' : ''}>{originLabel(d.origin)}</Badge>{d.priority && d.priority !== 'normal' && <Badge tone={d.priority === 'high' ? 'red' : ''}>Prioridad {priorityLabels[d.priority].toLowerCase()}</Badge>}</span><Icon name="arrow" size={15} /></div><h3>{c?.name}</h3><p>{d.service}</p><strong className="deal-amount">{d.amount ? money(d.amount) : 'Por cotizar'}</strong>
            <div className="card-contact">{person ? <><span className="avatar small">{initials(person.name)}</span><span>{person.name}</span></>
              : <button type="button" className="add-contact" onClick={e => { e.preventDefault(); e.stopPropagation(); setAction({ deal: d, type: 'contact' }) }}><Icon name="plus" size={13} /> Agregar contacto</button>}</div>
            <div className="card-owner"><span className="avatar small">{initials(d.owner)}</span>{d.owner}</div><small className="card-created">Creado {dateTime(d.createdAt)}</small>
            <div className={`next-action ${due !== undefined && due < now ? 'late' : ''}`}><Icon name="clock" size={14} />{due !== undefined ? `${due < now ? 'Vencida · ' : ''}${dateLabel(new Date(due).toISOString())}` : 'Sin próxima acción'}</div>
            {d.expectedClose && <div className={`close-date ${isOpen(d) && d.expectedClose < limaDay(now) ? 'late' : ''}`}><Icon name="calendar" size={12} />Cierre esperado {dateLabel(d.expectedClose)}</div>}
            {sla && <div className="sla-chip" role="status"><Icon name="clock" size={12} />{sla}</div>}<QuickActions person={person} onForm={type => setAction({ deal: d, type })} /></Link>
        })}{!deals.length && <div className="column-empty">Sin negocios en esta etapa</div>}</div>
        <div className="column-foot"><span>Total: <strong>{money(deals.reduce((v, d) => v + d.amount, 0))}</strong></span>{!['won', 'lost'].includes(s.id) && <span title={`Probabilidad de cierre estimada: ${Math.round(stageProbability[s.id] * 100)}%`}>Ponderado: <strong>{weighted(deals)}</strong></span>}</div></section>
    })}</div> : <section className="panel table-wrap"><table><thead><tr><th>Empresa / negocio</th><th>Etapa</th><th>Valor comercial</th><th>Contacto</th><th>Responsable</th><th>Origen</th><th>Creado</th><th>Seguimiento</th></tr></thead><tbody>{filtered.map(d => <tr key={d.id}><td><Link className="record-button" to={`/negocios/${d.id}`}>{data.companies.find(c => c.id === d.companyId)?.name}</Link><small>{d.service}</small></td><td><Badge>{stages.find(s => s.id === d.stage)?.name}</Badge></td><td>{money(d.amount)}</td><td>{contactOf(d)?.name ?? <Badge>Sin contacto</Badge>}</td><td>{d.owner}</td><td>{originLabel(d.origin)}</td><td>{dateTime(d.createdAt)}</td><td>{slaOf(d) || (overdue(d) ? 'Acción vencida' : '—')}</td></tr>)}</tbody></table>{!filtered.length && <Empty />}</section>}
    {lost && <DealForm deal={lost} type="lost" onClose={() => setLost(null)} />}{importing && <ImportDeals onClose={() => setImporting(false)} />}{action && <DealForm deal={action.deal} type={action.type} onClose={() => setAction(null)} />}
  </>
}
