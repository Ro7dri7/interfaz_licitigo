import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Empty, Icon, PageHead } from './components'
import { useCRM } from './crm-context'
import { dateLabel, dateTime, money, quoteStatusLabels } from './types'
import type { Quote } from './types'
import QuotePreview from './QuoteDocument'

export function Agenda() {
  const { snapshot: { data }, command, now } = useCRM(), [completed, setCompleted] = useState(false)
  const [error, setError] = useState(''), [busy, setBusy] = useState('')
  const tasks = data.tasks.filter(t => t.done === completed).slice().sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  return <><PageHead title="Agenda comercial" description="Seguimientos y compromisos del equipo · hora de Perú." />
    <div className="tabs"><button className={!completed ? 'active' : ''} onClick={() => setCompleted(false)}>Pendientes <span>{data.tasks.filter(t => !t.done).length}</span></button><button className={completed ? 'active' : ''} onClick={() => setCompleted(true)}>Completadas</button></div>
    {error && <p className="error" role="alert">{error}</p>}<section className="panel"><div className="task-list">{tasks.map(t => {
      const d = data.deals.find(d => d.id === t.dealId), company = data.companies.find(c => c.id === d?.companyId), late = !t.done && new Date(t.dueAt).getTime() < now
      return <div className="task-row" key={t.id}><span className="task-symbol"><Icon name={t.done ? 'check' : 'calendar'} /></span><div><Link to={`/negocios/${t.dealId}`}><strong>{t.title}</strong></Link><p>{company?.name} · {d?.owner}</p></div><span className={late ? 'due late' : 'due'}>{late ? 'Vencida · ' : ''}{dateTime(t.dueAt)}</span>{!t.done && <button disabled={busy === t.id} onClick={async () => {
        setBusy(t.id); setError(''); try { await command('complete_task', { taskId: t.id }) } catch (e) { setError((e as Error).message) } finally { setBusy('') }
      }}>Completar</button>}</div>
    })}{!tasks.length && <Empty title={completed ? 'Sin tareas completadas' : 'No hay tareas pendientes'}>Programa una acción desde la ficha de un negocio.</Empty>}</div></section></>
}

export function Quotes() {
  const { snapshot: { data } } = useCRM(), [selected, setSelected] = useState<Quote | null>(null)
  return <><PageHead title="Cotizaciones" description="Propuestas versionadas. Cada borrador conserva su precio y sus condiciones." />
    <section className="panel table-wrap"><table><thead><tr><th>Propuesta</th><th>Empresa / servicio</th><th>Estado</th><th>Vigencia</th><th>Total</th><th></th></tr></thead><tbody>{data.quotes.slice().reverse().map(q => {
      const d = data.deals.find(d => d.id === q.dealId), c = data.companies.find(c => c.id === d?.companyId)
      return <tr key={q.id}><td><button className="record-button" onClick={() => setSelected(q)}>{q.number}</button><small>Versión {q.version}</small></td><td><Link to={`/negocios/${q.dealId}`}><strong>{c?.name}</strong></Link><small>{q.items.length} {q.items.length === 1 ? 'partida' : 'partidas'} · {q.title || q.productName}</small></td><td><Badge tone={q.status === 'accepted' ? 'green' : q.status === 'sent' ? 'blue' : ''}>{quoteStatusLabels[q.status]}</Badge></td><td>{dateLabel(q.validUntil)}</td><td><strong>{money(q.total)}</strong></td><td><button onClick={() => setSelected(q)}>Ver propuesta</button></td></tr>
    })}</tbody></table>{!data.quotes.length && <Empty title="Tu primera propuesta empieza en un negocio">Abre un negocio y selecciona Cotizar.</Empty>}</section>{selected && <QuotePreview quote={selected} onClose={() => setSelected(null)} />}</>
}

export { default as QuotePreview } from './QuoteDocument'

export { default as Catalog } from './Catalog'

export function SettingsPage() {
  const { session } = useCRM()
  return <><PageHead title="Espacio e integraciones" description="Qué puedes usar hoy y qué falta conectar." />
    <section className="panel settings-panel"><h2>Estado del espacio</h2><div className="integration-row"><div><strong>Persistencia comercial</strong><p>{session.mode === 'demo' ? 'Espacio de prueba local con datos ficticios. Los cambios se guardan en este equipo.' : 'Espacio comercial conectado a Supabase.'}</p></div><Badge tone="green">{session.mode === 'demo' ? 'Prueba local' : 'Supabase'}</Badge></div>
      <div className="integration-row"><div><strong>Solicitudes del portal y Telegram</strong><p>Ingresan directamente a Negocios cuando el cliente confirma que quiere asesoría. Cada solicitud conserva su origen. La conexión completa requiere que el portal y el bot estén configurados y encendidos.</p></div><Badge tone={session.intakeEnabled ? 'green' : 'amber'}>{session.intakeEnabled ? 'Recepción habilitada' : 'Recepción deshabilitada'}</Badge></div>
      {[['WhatsApp y correo', 'Puedes registrar su origen y actividades. La bandeja y los envíos no están conectados.'], ['Postventa y comisiones', 'Renovaciones, cobros, entrega y reglas de comisión pendientes de implementación.']].map(([name, detail]) => <div className="integration-row" key={name}><div><strong>{name}</strong><p>{detail}</p></div><Badge tone="amber">Pendiente</Badge></div>)}</section>
    <div className="info-strip"><Icon name="file" />El alcance y los pasos de activación están documentados en README.md y docs/ESTADO.md del proyecto.</div></>
}
