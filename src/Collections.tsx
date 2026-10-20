import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Empty, Icon, Modal, PageHead } from './components'
import { useCRM } from './crm-context'
import { originLabel, dateLabel, evidenceLabels, initials, kindLabels, money, origins, stages } from './types'
import type { Prospect } from './types'

export function Filters({ children }: { children?: React.ReactNode }) {
  const [params, setParams] = useSearchParams()
  const change = (key: string, value: string) => setParams(p => { if (value) p.set(key, value); else p.delete(key); return p }, { replace: true })
  return <div className="filters"><label className="search-field"><Icon name="search" /><input aria-label="Buscar registros" type="search" placeholder="Buscar empresa, contacto o servicio…" value={params.get('q') ?? ''} onChange={e => change('q', e.target.value)} /></label>
    <select aria-label="Filtrar por origen" value={params.get('origen') ?? ''} onChange={e => change('origen', e.target.value)}><option value="">Todos los orígenes</option>{origins.map(o => <option key={o} value={o}>{originLabel(o)}</option>)}</select>{children}
    {params.size > 0 && <button className="text-button" onClick={() => setParams({})}>Limpiar filtros</button>}</div>
}

export function Prospects({ onCreate }: { onCreate: () => void }) {
  const { snapshot: { data }, command } = useCRM(), [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<Prospect | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const mode = params.get('tipo') ?? 'all', search = (params.get('q') ?? '').toLocaleLowerCase()
  const rows = data.prospects.filter(p => {
    const c = data.companies.find(c => c.id === p.companyId)
    return (mode === 'all' || (mode === 'signal' ? p.kind === 'signal' : ['advice', 'quote'].includes(p.kind))) &&
      (!params.get('origen') || p.origin === params.get('origen')) && `${c?.name} ${c?.ruc} ${p.service}`.toLocaleLowerCase().includes(search)
  })
  return <><PageHead title="Prospectos" description="Distingue una señal de interés de una solicitud comercial."><button className="primary" onClick={onCreate}><Icon name="plus" /> Agregar prospecto</button></PageHead>
    <div className="tabs">{[['all', 'Todos los prospectos'], ['request', 'Solicitudes explícitas'], ['signal', 'Señales LiciHub']].map(([id, name]) => <button key={id} aria-pressed={mode === id} className={mode === id ? 'active' : ''} onClick={() => setParams(p => { p.set('tipo', id); return p })}>{name}<span>{data.prospects.filter(p => id === 'all' || (id === 'signal' ? p.kind === 'signal' : ['advice', 'quote'].includes(p.kind))).length}</span></button>)}</div>
    <Filters />{mode === 'signal' && <div className="info-strip"><Icon name="radar" />Estas señales orientan la prospección. Confirma la necesidad con el cliente antes de abrir una venta.</div>}
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Empresa</th><th>Interés / procedencia</th><th>Contexto ISO</th><th>Responsable</th><th>Estado</th></tr></thead><tbody>{rows.map(p => {
      const c = data.companies.find(c => c.id === p.companyId)
      return <tr key={p.id}><td><button className="record-button" onClick={() => { setSelected(p); setError('') }}>{c?.name}</button><small>{c?.ruc || 'RUC por completar'}</small></td>
        <td><strong>{p.service}</strong><small>{originLabel(p.origin)} · {kindLabels[p.kind]}</small></td><td><Badge tone={p.evidence === 'required' ? 'amber' : p.evidence === 'recommended' ? 'blue' : ''}>{evidenceLabels[p.evidence]}</Badge>{p.tender && <small>{p.tender}</small>}</td><td>{p.owner}</td>
        <td>{p.dealId ? <Link className="text-link" to={`/negocios/${p.dealId}`}>Ver negocio <Icon name="arrow" size={16} /></Link> : <Badge>Por revisar</Badge>}</td></tr>
    })}</tbody></table>{!rows.length && <Empty />}</div><div className="table-foot">{rows.length} registros · Las señales conservan su origen al convertirse en negocio.</div></section>
    {selected && <Modal title={data.companies.find(c => c.id === selected.companyId)?.name ?? 'Prospecto'} onClose={() => setSelected(null)}><div className="form-body">
      <Badge tone={selected.kind === 'signal' ? 'amber' : 'blue'}>{kindLabels[selected.kind]}</Badge><h3>{selected.service}</h3>
      <dl className="properties"><div><dt>Origen</dt><dd>{originLabel(selected.origin)}</dd></div><div><dt>Responsable</dt><dd>{selected.owner}</dd></div><div><dt>Análisis</dt><dd>{evidenceLabels[selected.evidence]}</dd></div><div><dt>Licitación</dt><dd>{selected.tender || 'No asociada'}</dd></div><div><dt>Plazo</dt><dd>{selected.deadline ? dateLabel(selected.deadline) : 'Sin fecha'}</dd></div></dl>
      <p>{selected.notes || 'Sin notas adicionales.'}</p><p className="hint">La recomendación de una ISO no equivale a una carencia confirmada en la empresa.</p>{error && <p className="error" role="alert">{error}</p>}
    </div><footer>{selected.dealId ? <Link className="button primary" to={`/negocios/${selected.dealId}`} onClick={() => setSelected(null)}>Abrir negocio</Link> : <button className="primary" disabled={busy} onClick={async () => {
      setBusy(true); try { await command('convert', { prospectId: selected.id }); setSelected(null) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
    }}>{busy ? 'Guardando…' : 'Confirmar interés y abrir negocio'}</button>}</footer></Modal>}
  </>
}

export function Pipeline({ onCreate }: { onCreate: () => void }) {
  const { snapshot: { data }, now } = useCRM(), [params, setParams] = useSearchParams()
  const view = params.get('vista') ?? 'board', search = (params.get('q') ?? '').toLocaleLowerCase()
  const filtered = data.deals.filter(d => `${data.companies.find(c => c.id === d.companyId)?.name} ${d.service}`.toLocaleLowerCase().includes(search)
    && (!params.get('origen') || d.origin === params.get('origen')) && (!params.get('etapa') || d.stage === params.get('etapa'))
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

export function Directory({ contacts = false, onCreate }: { contacts?: boolean; onCreate: () => void }) {
  const { snapshot: { data } } = useCRM(), [params] = useSearchParams()
  const query = (params.get('q') ?? '').toLocaleLowerCase(), companyId = params.get('empresa')
  const companies = data.companies.filter(c => (!companyId || c.id === companyId) && (!params.get('origen') || c.origin === params.get('origen')))
  const companyRows = companies.filter(c => `${c.name} ${c.ruc}`.toLocaleLowerCase().includes(query))
  const people = data.contacts.filter(p => companies.some(c => c.id === p.companyId)
    && `${p.name} ${p.email} ${p.phone} ${companies.find(c => c.id === p.companyId)?.name}`.toLocaleLowerCase().includes(query))
  return <><PageHead title={contacts ? 'Contactos' : 'Empresas'}
    description={contacts ? 'Personas con quienes conversas: correo, teléfono y empresa a la que pertenecen.' : 'Organizaciones identificadas por su RUC, con sus contactos y oportunidades comerciales.'}>
    <button className="primary" onClick={onCreate}><Icon name="plus" /> Registrar prospecto</button></PageHead>
    <div className="info-strip"><Icon name={contacts ? 'users' : 'company'} />{contacts ? 'Una empresa puede tener varios contactos: compras, gerencia o administración. Cada persona conserva sus propios datos.' : 'La empresa es la organización; los contactos son las personas que trabajan en ella. No son registros equivalentes.'}</div>
    <Filters />
    <section className="panel table-wrap">{contacts ? <table><thead><tr><th>Persona de contacto</th><th>Empresa</th><th>Correo</th><th>Teléfono</th><th>Negocios de su empresa</th></tr></thead><tbody>{people.map(person => {
      const company = companies.find(c => c.id === person.companyId), deals = data.deals.filter(d => d.companyId === person.companyId)
      return <tr key={person.id}><td><strong>{person.name}</strong></td><td><Link to={`/empresas?empresa=${company?.id}`}>{company?.name}</Link><small>{company?.ruc || 'RUC por completar'}</small></td><td>{person.email || 'Sin correo'}</td><td>{person.phone || 'Sin teléfono'}</td><td>{deals.map(d => <Link key={d.id} className="association-link" to={`/negocios/${d.id}`}>{d.service}<Icon name="arrow" size={14} /></Link>)}{!deals.length && <Badge>En prospección</Badge>}</td></tr>
    })}</tbody></table> : <table><thead><tr><th>Empresa / razón social</th><th>RUC</th><th>Personas de contacto</th><th>Oportunidades</th><th>Valor abierto</th></tr></thead><tbody>{companyRows.map(company => {
      const people = data.contacts.filter(p => p.companyId === company.id), deals = data.deals.filter(d => d.companyId === company.id)
      return <tr key={company.id}><td><strong>{company.name}</strong><small>{originLabel(company.origin)}</small></td><td className="mono">{company.ruc || 'Por completar'}</td><td><Link className="text-link" to={`/contactos?empresa=${company.id}`}>{people.length} {people.length === 1 ? 'contacto' : 'contactos'}<Icon name="arrow" size={14} /></Link><small>{people.map(p => p.name).join(', ') || 'Sin personas asociadas'}</small></td><td>{deals.map(d => <Link key={d.id} className="association-link" to={`/negocios/${d.id}`}>{d.service}<Icon name="arrow" size={14} /></Link>)}{!deals.length && <Badge>En prospección</Badge>}</td><td>{money(deals.filter(d => !['won', 'lost'].includes(d.stage)).reduce((sum, d) => sum + d.amount, 0))}</td></tr>
    })}</tbody></table>}
    {!(contacts ? people.length : companyRows.length) && <Empty>{contacts ? 'No hay personas que coincidan con esos filtros.' : 'No hay organizaciones que coincidan con esos filtros.'}</Empty>}
    <div className="table-foot">{contacts ? `${people.length} personas` : `${companyRows.length} empresas`} · {contacts ? 'Cada fila corresponde a una persona.' : 'Cada fila corresponde a una organización.'}</div></section></>
}
