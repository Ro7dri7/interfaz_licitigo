import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BarList, Donut, LineChart } from './Charts'
import type { Row } from './Charts'
import { Empty, Icon, PageHead } from './components'
import { useCRM } from './crm-context'
import { countBy, presets, propField, rangeFor, rankProducts, soldQuotes, summarize, timeline, valueOf } from './analytics'
import type { Cond, FieldDef, Preset } from './analytics'
import { dateLabel, money, originLabel, priorityLabels, propertyEntityLabels, quoteStatusLabels, stages } from './types'
import { downloadCsv, limaDay } from './utils'
import { crmPath } from './paths'

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
const percent = (part: number, whole: number) => whole ? `${Math.round(part / whole * 100)}%` : '0%'
const originColors: Record<string, string> = { Telegram: '#14b8a6', Lici: '#2f5bea', WhatsApp: '#16a34a', Referido: '#d97706', Campaña: '#7c3aed', Manual: '#64748b', Partner: '#0891b2' }
const quoteColors = { draft: '#94a3b8', sent: '#2f5bea', accepted: '#15803d', rejected: '#dc2626' }
const labelOfOrigin = (origin: string) => origin === 'Telegram' ? 'Chatbot (Telegram)' : originLabel(origin)

function readConds(raw: string | null): Cond[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]')
    return Array.isArray(value) ? value.filter(c => typeof c?.field === 'string').map(c => ({ field: c.field, value: String(c.value ?? ''), ...(c.to ? { to: String(c.to) } : {}) })) : []
  } catch { return [] }
}

function CondRow({ index, cond, defs, onChange, onRemove }: { index: number; cond: Cond; defs: FieldDef[]; onChange: (cond: Cond) => void; onRemove: () => void }) {
  const def = defs.find(d => d.id === cond.field), n = index + 1
  return <div className="cond-row"><select aria-label={`Campo del filtro ${n}`} value={cond.field} onChange={e => onChange({ field: e.target.value, value: '' })}>{defs.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
    {def?.kind === 'select' && <select aria-label={`Valor del filtro ${n}`} value={cond.value} onChange={e => onChange({ ...cond, value: e.target.value })}><option value="">Cualquiera</option>{def.options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select>}
    {def?.kind === 'text' && <input aria-label={`Valor del filtro ${n}`} placeholder="Contiene…" value={cond.value} onChange={e => onChange({ ...cond, value: e.target.value })} />}
    {(def?.kind === 'number' || def?.kind === 'date') && <><input aria-label={`Desde del filtro ${n}`} type={def.kind} placeholder="Mínimo" value={cond.value} onChange={e => onChange({ ...cond, value: e.target.value })} />
      <input aria-label={`Hasta del filtro ${n}`} type={def.kind} placeholder="Máximo" value={cond.to ?? ''} onChange={e => onChange({ ...cond, to: e.target.value })} /></>}
    <button type="button" className="icon-button" aria-label={`Quitar filtro ${n}`} onClick={onRemove}><Icon name="close" size={16} /></button></div>
}

function Card({ title, description, wide = false, controls, children }: { title: string; description: string; wide?: boolean; controls?: React.ReactNode; children: React.ReactNode }) {
  return <section className={`panel chart-card ${wide ? 'span-2' : ''}`} aria-label={title}><div className="section-head"><div><h2>{title}</h2><p>{description}</p></div>{controls}</div><div className="chart-body">{children}</div></section>
}

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (value: T) => void; label: string }) {
  return <div className="segmented small" role="group" aria-label={label}>{options.map(([id, text]) => <button type="button" key={id} aria-pressed={value === id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>{text}</button>)}</div>
}

export default function Admin({ onCreate }: { onCreate: () => void }) {
  const { snapshot: { data }, now } = useCRM(), [params, setParams] = useSearchParams()
  const [mode, setMode] = useState<'vendido' | 'cotizado'>('vendido'), [metric, setMetric] = useState<'monto' | 'negocios'>('monto'), [propId, setPropId] = useState('')
  const setParam = (changes: Record<string, string>) => setParams(p => { for (const [key, value] of Object.entries(changes)) { if (value) p.set(key, value); else p.delete(key) } return p }, { replace: true })
  const raw = params.get('rango'), preset: Preset = presets.some(([id]) => id === raw) || raw === 'custom' ? raw as Preset : 'todo'
  const range = rangeFor(preset, now, params.get('desde') ?? '', params.get('hasta') ?? ''), conds = readConds(params.get('f'))
  const writeConds = (next: Cond[]) => setParam({ f: next.length ? JSON.stringify(next) : '' })
  const s = summarize(data, conds, range), today = limaDay(now)

  const byOrigin = countBy(s.deals, d => d.origin), chatbot = byOrigin.get('Telegram') ?? 0, portal = byOrigin.get('Lici') ?? 0
  const sold = soldQuotes(data, s.quotes), products = rankProducts(mode === 'vendido' ? sold : s.quotes)
  const wonAmount = sum(s.won.map(d => d.amount)), openAmount = sum(s.open.map(d => d.amount))
  const onSale = new Map<string, { count: number; amount: number }>()
  for (const d of s.open) { const row = onSale.get(d.companyId) ?? { count: 0, amount: 0 }; row.count += 1; row.amount += d.amount; onSale.set(d.companyId, row) }
  const companiesOnSale = [...onSale].map(([id, v]) => ({ id, name: data.companies.find(c => c.id === id)?.name ?? '', ...v })).sort((a, b) => b.amount - a.amount || b.count - a.count)

  const groupProps = data.properties.filter(p => p.active && p.type === 'select')
  const chosen = groupProps.find(p => p.id === propId) ?? groupProps.find(p => p.name.toLocaleLowerCase() === 'sector') ?? groupProps[0]
  const groups = new Map<string, { count: number; amount: number }>()
  if (chosen) {
    const field = propField(chosen.id), at = (key: string) => groups.get(key) ?? { count: 0, amount: 0 }
    for (const d of s.deals) { const key = valueOf(data, d, field) || 'Sin dato'; groups.set(key, { ...at(key), count: at(key).count + 1 }) }
    for (const d of s.won) { const key = valueOf(data, d, field) || 'Sin dato'; groups.set(key, { ...at(key), amount: at(key).amount + d.amount }) }
  }
  const groupRows: Row[] = [...groups].map(([label, g]) => ({ label, value: metric === 'monto' ? g.amount : g.count, hint: metric === 'monto' ? `${g.count} ${g.count === 1 ? 'negocio' : 'negocios'}` : `Vendido ${money(g.amount)}` }))
    .filter(r => r.value > 0).sort((a, b) => b.value - a.value)
  const known = [...groups].filter(([label]) => label !== 'Sin dato'), leader = known.sort((a, b) => b[1].amount - a[1].amount || b[1].count - a[1].count)[0]

  const originRows: Row[] = [...byOrigin].sort((a, b) => b[1] - a[1]).map(([origin, count]) => ({ label: labelOfOrigin(origin), value: count, color: originColors[origin], hint: percent(count, s.deals.length) }))
  const stageRows: Row[] = stages.map(st => { const list = s.deals.filter(d => d.stage === st.id); return { label: st.name, value: list.length, color: st.color, hint: money(sum(list.map(d => d.amount))) } })
  const quoteCounts = countBy(s.quotes, q => q.status), quoteRows: Row[] = (Object.keys(quoteStatusLabels) as (keyof typeof quoteColors)[]).map(k => ({ label: quoteStatusLabels[k], value: quoteCounts.get(k) ?? 0, color: quoteColors[k] }))
  const ownerRows: Row[] = [...countBy(s.deals, d => d.owner)].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([owner, count]) => ({ label: owner, value: count, hint: `Vendido ${money(sum(s.won.filter(d => d.owner === owner).map(d => d.amount)))}` }))
  const line = timeline({ Negocios: s.deals.map(d => d.createdAt), Cotizaciones: s.quotes.map(q => q.createdAt), Ventas: s.won.map(d => d.closedAt!) }, range, today)
  const filtering = preset !== 'todo' || conds.length > 0, hasDeals = s.deals.length > 0 || s.quotes.length > 0 || s.won.length > 0
  const rangeText = range.from || range.to ? `${range.from ? dateLabel(range.from) : 'el inicio'} – ${range.to ? dateLabel(range.to) : 'hoy'}` : 'todo el tiempo'

  function exportCsv() {
    const props = data.properties.filter(p => p.active)
    const head = ['Empresa', 'RUC', 'Servicio', 'Origen', 'Etapa', 'Valor (S/)', 'Responsable', 'Prioridad', 'Creado', ...props.map(p => `${p.name} (${propertyEntityLabels[p.entity]})`)]
    downloadCsv(`panel-admin-${today}.csv`, [head, ...s.deals.map(d => { const c = data.companies.find(c => c.id === d.companyId)
      return [c?.name ?? '', c?.ruc ?? '', d.service, labelOfOrigin(d.origin), stages.find(st => st.id === d.stage)?.name ?? d.stage, (d.amount / 100).toFixed(2), d.owner, priorityLabels[d.priority ?? 'normal'], limaDay(d.createdAt), ...props.map(p => valueOf(data, d, propField(p.id)))] })])
  }

  const kpis: [string, string, string, boolean?][] = [
    ['Negocios nuevos', String(s.deals.length), `${s.open.length} ${s.open.length === 1 ? 'sigue abierto' : 'siguen abiertos'}`], ['Empresas a la venta', String(companiesOnSale.length), `${money(openAmount)} en cartera abierta`],
    ['Cotizaciones', String(s.quotes.length), `${quoteCounts.get('accepted') ?? 0} aceptadas`], ['Vendido', money(wonAmount), `${s.won.length} ${s.won.length === 1 ? 'negocio ganado' : 'negocios ganados'}`],
    ['Desde el chatbot', String(chatbot), `${percent(chatbot, s.deals.length)} de los negocios · Telegram`], ['Desde el portal LiciHub', String(portal), `${percent(portal, s.deals.length)} de los negocios`],
    ['Producto más vendido', sold.length ? rankProducts(sold)[0].name : '—', sold.length ? money(rankProducts(sold)[0].amount) : 'Aún sin ventas en este periodo', true],
    [chosen ? `${chosen.name} más vendido` : 'Sector más vendido', leader && (leader[1].amount || leader[1].count) ? leader[0] : '—', leader ? (leader[1].amount ? money(leader[1].amount) : `${leader[1].count} ${leader[1].count === 1 ? 'negocio' : 'negocios'}`) : 'Crea la propiedad «Sector»', true],
  ]

  return <><PageHead eyebrow="ADMINISTRACIÓN" title="Panel de administración" description={`Todo lo que hay en el CRM, en gráficos · ${rangeText}`}>
    <Link className="button" to={crmPath("/admin/equipo")}><Icon name="users" size={16} /> Equipo</Link>
    <Link className="button" to={crmPath("/admin/propiedades")}><Icon name="tag" size={16} /> Propiedades</Link>
    <button onClick={exportCsv} disabled={!s.deals.length}><Icon name="download" size={16} /> Exportar</button>
    <button className="primary" onClick={onCreate}><Icon name="plus" /> Nuevo negocio</button></PageHead>

    <section className="panel admin-filters" aria-label="Filtros del panel">
      <div className="range-row" role="group" aria-label="Rango de fechas">{presets.map(([id, text]) => <button type="button" key={id} className={`chip ${preset === id ? 'active' : ''}`} aria-pressed={preset === id}
        onClick={() => setParam({ rango: id === 'todo' ? '' : id, desde: '', hasta: '' })}>{text}</button>)}
        <label className="inline-field">Desde<input type="date" aria-label="Fecha desde" value={range.from} max={range.to || undefined} onChange={e => setParam({ rango: 'custom', desde: e.target.value, hasta: preset === 'custom' ? params.get('hasta') ?? '' : range.to })} /></label>
        <label className="inline-field">Hasta<input type="date" aria-label="Fecha hasta" value={range.to} min={range.from || undefined} onChange={e => setParam({ rango: 'custom', hasta: e.target.value, desde: preset === 'custom' ? params.get('desde') ?? '' : range.from })} /></label></div>
      <div className="cond-list">{conds.map((c, i) => <CondRow key={i} index={i} cond={c} defs={s.defs} onChange={next => writeConds(conds.map((x, j) => j === i ? next : x))} onRemove={() => writeConds(conds.filter((_, j) => j !== i))} />)}</div>
      <div className="cond-actions"><button type="button" onClick={() => writeConds([...conds, { field: s.defs[0].id, value: '' }])}><Icon name="filter" size={15} /> Agregar filtro</button>
        {filtering && <button type="button" className="text-button" onClick={() => setParams(new URLSearchParams())}>Limpiar filtros</button>}
        <small>Filtra por origen, etapa, responsable, prioridad o cualquier propiedad que hayas creado. La fecha se aplica a cuando se creó cada negocio y cada cotización; lo vendido, a la fecha de cierre.</small></div></section>

    <div className="admin-metrics" aria-label="Resumen">{kpis.map(([name, value, hint, text]) => <div key={name}><small>{name}</small><strong className={text ? 'kpi-text' : ''} title={value}>{value}</strong><span>{hint}</span></div>)}</div>
    {!hasDeals && <div className="info-strip"><Icon name="search" />{filtering ? 'No hay registros con estos filtros. Prueba con otro rango de fechas o quita algún filtro.' : 'Aún no hay negocios en el CRM.'}</div>}

    <div className="admin-grid">
      <Card title="Negocios por origen" description="Cuántos llegaron por el chatbot, el portal de LiciHub u otros canales."><Donut label="Negocios por origen" rows={originRows} center={<><strong>{s.deals.length}</strong><small>negocios</small></>} /></Card>
      <Card title="Producto más vendido" description="Ranking de servicios por monto." controls={<Toggle label="Base del ranking" value={mode} onChange={setMode} options={[['vendido', 'Vendido'], ['cotizado', 'Cotizado']]} />}>
        {products.length ? <BarList label="Productos más vendidos" rows={products.slice(0, 6).map(p => ({ label: p.name, value: p.amount, hint: `${p.quantity} ${p.quantity === 1 ? 'unidad' : 'unidades'}` }))} format={money} />
          : <Empty title={mode === 'vendido' ? 'Aún sin ventas en este periodo' : 'Aún sin cotizaciones'}>{mode === 'vendido' ? 'Se cuentan las cotizaciones aceptadas y los negocios ganados. Mira «Cotizado» para ver lo ofrecido.' : 'Prepara una cotización desde un negocio.'}</Empty>}</Card>
      <Card title="Cotizaciones" description="Estado de las propuestas emitidas en el periodo."><Donut label="Cotizaciones por estado" rows={quoteRows} center={<><strong>{s.quotes.length}</strong><small>cotizaciones</small></>} /></Card>
      <Card title={chosen ? `${chosen.name}: ventas y negocios` : 'Sector más vendido'} description={chosen ? `Agrupado por la propiedad «${chosen.name}».` : 'Necesitas una propiedad de lista para agrupar.'}
        controls={chosen && <div className="card-controls">{groupProps.length > 1 && <select aria-label="Agrupar por propiedad" value={chosen.id} onChange={e => setPropId(e.target.value)}>{groupProps.map(p => <option key={p.id} value={p.id}>{p.name} ({propertyEntityLabels[p.entity].toLocaleLowerCase()})</option>)}</select>}
          <Toggle label="Medida" value={metric} onChange={setMetric} options={[['monto', 'Vendido'], ['negocios', 'Negocios']]} /></div>}>
        {!chosen ? <Empty title="Aún no hay propiedades de lista"><Link to={crmPath("/admin/propiedades")}>Crea la propiedad «Sector»</Link> para ver qué sector vende más.</Empty>
          : groupRows.length ? <BarList label={`${chosen.name} más vendido`} rows={groupRows.slice(0, 8)} format={metric === 'monto' ? money : String} />
            : <Empty title="Sin datos en este periodo">{metric === 'monto' ? 'Aún no hay ventas en este periodo. Mira «Negocios».' : 'Ningún negocio coincide con los filtros.'}</Empty>}</Card>
      <Card title="Embudo comercial" description="Negocios del periodo por etapa."><BarList label="Negocios por etapa" rows={stageRows} /></Card>
      <Card title="Responsables" description="Negocios asignados y lo vendido por cada persona.">{ownerRows.length ? <BarList label="Negocios por responsable" rows={ownerRows} /> : <Empty title="Sin negocios en este periodo" />}</Card>
      <Card wide title="Evolución" description={`Negocios, cotizaciones y ventas por ${line.unit === 'day' ? 'día' : line.unit === 'week' ? 'semana' : 'mes'}.`}>
        <LineChart label="Evolución en el tiempo" labels={line.labels} series={[{ name: 'Negocios', color: '#2f5bea', values: line.values.Negocios }, { name: 'Cotizaciones', color: '#d97706', values: line.values.Cotizaciones }, { name: 'Ventas', color: '#15803d', values: line.values.Ventas }]} /></Card>
      <Card wide title="Empresas a la venta" description="Empresas con negocios abiertos, de mayor a menor monto.">
        {companiesOnSale.length ? <div className="table-wrap"><table><thead><tr><th>Empresa</th><th>Negocios abiertos</th><th>Monto en cartera</th></tr></thead><tbody>{companiesOnSale.slice(0, 8).map(c => <tr key={c.id}>
          <td><Link className="record-button" to={crmPath(`/directorio/empresas/${c.id}`)}>{c.name}</Link></td><td>{c.count}</td><td>{c.amount ? money(c.amount) : 'Por cotizar'}</td></tr>)}</tbody></table></div>
          : <Empty title="Ninguna empresa con negocios abiertos" />}</Card>
    </div></>
}
