import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Empty, Icon, PageHead } from './components'
import { useCRM } from './crm-context'
import { originLabel, dateLabel, initials, money, origins, stages } from './types'

export function Filters({ children, preserve = [] }: { children?: React.ReactNode; preserve?: string[] }) {
  const [params, setParams] = useSearchParams()
  const change = (key: string, value: string) => setParams(p => { if (value) p.set(key, value); else p.delete(key); return p }, { replace: true })
  return <div className="filters"><label className="search-field"><Icon name="search" /><input aria-label="Buscar registros" type="search" placeholder="Buscar empresa, contacto o servicio…" value={params.get('q') ?? ''} onChange={e => change('q', e.target.value)} /></label>
    <select aria-label="Filtrar por origen" value={params.get('origen') ?? ''} onChange={e => change('origen', e.target.value)}><option value="">Todos los orígenes</option>{origins.map(o => <option key={o} value={o}>{originLabel(o)}</option>)}</select>{children}
    {[...params.keys()].some(key => !preserve.includes(key)) && <button className="text-button" onClick={() => setParams(new URLSearchParams([...params].filter(([key]) => preserve.includes(key))))}>Limpiar filtros</button>}</div>
}

export function Pipeline({ onCreate }: { onCreate: () => void }) {
  const { snapshot: { data }, now } = useCRM(), [params, setParams] = useSearchParams()
  const view = params.get('vista') ?? 'board', search = (params.get('q') ?? '').toLocaleLowerCase()
  const filtered = data.deals.filter(d => `${data.companies.find(c => c.id === d.companyId)?.name} ${d.service}`.toLocaleLowerCase().includes(search)
    && (!params.get('origen') || (d.origin === params.get('origen') || data.prospects.some(p => p.dealId === d.id && p.origin === params.get('origen')))) && (!params.get('etapa') || d.stage === params.get('etapa'))
    && (!params.get('responsable') || d.owner === params.get('responsable')))
  return <><PageHead title="Negocios" description={`${filtered.length} oportunidades · ${money(filtered.filter(d => !['won', 'lost'].includes(d.stage)).reduce((s, d) => s + d.amount, 0))} en cartera abierta`}>
    <div className="segmented">{[['board', 'Tablero'], ['list', 'Lista']].map(([id, text]) => <button key={id} aria-pressed={view === id} className={view === id ? 'active' : ''} onClick={() => setParams(p => { p.set('vista', id); return p })}><Icon name={id} />{text}</button>)}</div>
    <button className="primary" onClick={onCreate}><Icon name="plus" /> Nueva oportunidad</button></PageHead>
    <Filters><select aria-label="Filtrar por responsable" value={params.get('responsable') ?? ''} onChange={e => setParams(p => { if (e.target.value) p.set('responsable', e.target.value); else p.delete('responsable'); return p })}><option value="">Todo el equipo</option>{[...new Set(data.deals.map(d => d.owner))].map(o => <option key={o}>{o}</option>)}</select></Filters>
    {view === 'board' ? <div className="board" aria-label="Tablero de negocios">{stages.filter(s => !params.get('etapa') || s.id === params.get('etapa')).map(s => {
      const deals = filtered.filter(d => d.stage === s.id)
      return <section className="board-column" key={s.id}><header><span className="status-dot" style={{ background: s.color }} /><h2>{s.name}</h2><span>{deals.length}</span></header><p className="column-total">{money(deals.reduce((v, d) => v + d.amount, 0))}</p>
        <div className="board-cards">{deals.map(d => {
          const c = data.companies.find(c => c.id === d.companyId), t = data.tasks.filter(t => t.dealId === d.id && !t.done).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0]
          return <Link to={`/negocios/${d.id}`} className="deal-card" key={d.id}><div className="card-top"><Badge tone={d.origin === 'Lici' ? 'blue' : ''}>{originLabel(d.origin)}</Badge><Icon name="arrow" size={15} /></div><h3>{c?.name}</h3><p>{d.service}</p><strong className="deal-amount">{d.amount ? money(d.amount) : 'Por cotizar'}</strong>
            <div className="card-owner"><span className="avatar small">{initials(d.owner)}</span>{d.owner}</div><div className={`next-action ${t && new Date(t.dueAt).getTime() < now ? 'late' : ''}`}><Icon name="clock" size={14} />{t ? `${new Date(t.dueAt).getTime() < now ? 'Vencida · ' : ''}${dateLabel(t.dueAt)}` : 'Sin próxima acción'}</div></Link>
        })}{!deals.length && <div className="column-empty">Sin negocios en esta etapa</div>}</div></section>
    })}</div> : <section className="panel table-wrap"><table><thead><tr><th>Empresa / negocio</th><th>Etapa</th><th>Valor comercial</th><th>Responsable</th><th>Origen</th></tr></thead><tbody>{filtered.map(d => <tr key={d.id}><td><Link className="record-button" to={`/negocios/${d.id}`}>{data.companies.find(c => c.id === d.companyId)?.name}</Link><small>{d.service}</small></td><td><Badge>{stages.find(s => s.id === d.stage)?.name}</Badge></td><td>{money(d.amount)}</td><td>{d.owner}</td><td>{originLabel(d.origin)}</td></tr>)}</tbody></table>{!filtered.length && <Empty />}</section>}
  </>
}
