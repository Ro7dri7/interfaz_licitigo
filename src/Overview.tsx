import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Badge, Empty, Icon, PageHead } from './components'
import { useCRM } from './crm-context'
import { originLabel, dateTime, initials, kindLabels, money, openDeal, stages } from './types'

export default function Overview({ onCreate }: { onCreate: () => void }) {
  const { snapshot: { data }, command, now } = useCRM()
  const [error, setError] = useState(''), [busy, setBusy] = useState('')
  const pending = data.tasks.filter(t => !t.done).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const overdue = pending.filter(t => new Date(t.dueAt).getTime() < now)
  const deals = data.deals.filter(openDeal)
  const signals = data.prospects.filter(p => p.kind === 'signal' && !p.dealId)
  const requests = data.prospects.filter(p => p.kind === 'quote' || p.kind === 'advice').filter(p => data.deals.some(d => d.id === p.dealId && d.stage === 'new'))
  return <><PageHead title="Tu día, con foco." description="Cada oportunidad, con el contexto y el siguiente paso que necesita.">
    <button className="primary" onClick={onCreate}><Icon name="plus" /> Nuevo prospecto</button></PageHead>
    <div className="metrics"><div><span>Solicitudes por atender</span><strong>{requests.length.toString().padStart(2, '0')}</strong><small>Interés explícito del cliente</small></div>
      <div><span>Negocios abiertos</span><strong>{deals.length.toString().padStart(2, '0')}</strong><small>{money(deals.reduce((v, d) => v + d.amount, 0))} en cartera</small></div>
      <div><span>Seguimientos vencidos</span><strong className={overdue.length ? 'amber-text' : ''}>{overdue.length.toString().padStart(2, '0')}</strong><small>Acciones que requieren atención</small></div>
      <div><span>Ventas ganadas</span><strong>{money(data.deals.filter(d => d.stage === 'won').reduce((v, d) => v + d.amount, 0))}</strong><small>Valor vendido · no equivale a cobros</small></div></div>
    <div className="overview-columns"><section className="panel"><div className="section-head"><div><h2>Próximas acciones</h2><p>Tu seguimiento hace la diferencia.</p></div><Link to="/agenda" className="text-link">Ver agenda <Icon name="arrow" /></Link></div>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="task-list">{pending.slice(0, 5).map(t => {
        const d = data.deals.find(d => d.id === t.dealId), c = data.companies.find(c => c.id === d?.companyId), late = new Date(t.dueAt).getTime() < now
        return <div className="task-row" key={t.id}><button className="task-check" aria-label={`Completar ${t.title} de ${c?.name}`} disabled={busy === t.id} onClick={async () => {
          setBusy(t.id); setError(''); try { await command('complete_task', { taskId: t.id }) } catch (e) { setError((e as Error).message) } finally { setBusy('') }
        }}><Icon name="check" size={14} /></button><div><Link to={`/negocios/${t.dealId}`}><strong>{t.title}</strong></Link><p>{c?.name} · {d?.owner}</p></div><span className={late ? 'due late' : 'due'}><Icon name="clock" size={14} />{late ? 'Vencida · ' : ''}{dateTime(t.dueAt)}</span></div>
      })}{pending.length === 0 && <Empty title="Todo al día">No tienes tareas pendientes.</Empty>}</div></section>
      <section className="radar-panel"><div className="radar-mark"><Icon name="radar" size={26} /><span>INTELIGENCIA LICIHUB</span></div><h2>Una señal puede ser<br />tu próxima oportunidad.</h2>
        <p>{signals.length} señales por revisar. Conoce qué necesita cada empresa antes de iniciar la conversación.</p>
        <div className="radar-stats"><span><strong>{signals.filter(p => p.evidence === 'required').length}</strong> requisitos detectados</span><span><strong>{signals.filter(p => p.evidence === 'recommended').length}</strong> recomendaciones</span></div>
        <Link to="/prospectos?tipo=signal" className="radar-link">Explorar señales LiciHub <Icon name="arrow" /></Link><small>Las señales no crean negocios automáticamente.</small></section></div>
    <section className="panel"><div className="section-head"><div><h2>Solicitudes que merecen atención</h2><p>Clientes que ya pidieron dar el siguiente paso.</p></div><Link to="/prospectos?tipo=request" className="text-link">Ver solicitudes <Icon name="arrow" /></Link></div>
      <div className="table-wrap"><table><thead><tr><th>Empresa / interés</th><th>Solicitud</th><th>Origen</th><th>Responsable</th><th></th></tr></thead><tbody>{requests.slice(0, 5).map(p => <tr key={p.id}>
        <td><strong>{data.companies.find(c => c.id === p.companyId)?.name}</strong><small>{p.service}</small></td><td><Badge tone="blue">{kindLabels[p.kind]}</Badge></td><td>{originLabel(p.origin)}</td><td><span className="person"><span className="avatar small">{initials(p.owner)}</span>{p.owner}</span></td><td><Link className="text-link" to={`/negocios/${p.dealId}`}>Abrir <Icon name="arrow" size={16} /></Link></td>
      </tr>)}</tbody></table>{!requests.length && <Empty title="Solicitudes atendidas">Las nuevas solicitudes aparecerán aquí.</Empty>}</div></section>
    <section className="pipeline-summary"><div><p className="eyebrow">TU CARTERA COMERCIAL</p><h2>Del interés al cierre</h2></div><div className="stage-stats">{stages.filter(s => !['won', 'lost'].includes(s.id)).map(s => <Link key={s.id} to={`/negocios?etapa=${s.id}`}><span className="status-dot" style={{ background: s.color }} /><strong>{data.deals.filter(d => d.stage === s.id).length}</strong><span>{s.name}</span></Link>)}</div></section>
  </>
}
