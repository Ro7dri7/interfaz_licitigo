import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Empty, Icon, Modal, PageHead } from './components'
import { useCRM } from './crm-context'
import { dateLabel, dateTime, money } from './types'
import type { Quote } from './types'

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
      return <tr key={q.id}><td><button className="record-button" onClick={() => setSelected(q)}>{q.number}</button><small>Versión {q.version}</small></td><td><Link to={`/negocios/${q.dealId}`}><strong>{c?.name}</strong></Link><small>{q.productName}</small></td><td><Badge>Borrador</Badge></td><td>{dateLabel(q.validUntil)}</td><td><strong>{money(q.total)}</strong></td><td><button onClick={() => setSelected(q)}>Ver propuesta</button></td></tr>
    })}</tbody></table>{!data.quotes.length && <Empty title="Tu primera propuesta empieza en un negocio">Abre un negocio y selecciona Cotizar.</Empty>}</section>{selected && <QuotePreview quote={selected} onClose={() => setSelected(null)} />}</>
}

export function QuotePreview({ quote: q, onClose }: { quote: Quote; onClose: () => void }) {
  const { snapshot: { data } } = useCRM(), d = data.deals.find(d => d.id === q.dealId), c = data.companies.find(c => c.id === d?.companyId)
  return <Modal title={`${q.number} · versión ${q.version}`} onClose={onClose} wide><div className="quote-sheet"><div className="quote-letterhead"><div className="brand">LiciHub<span>.</span></div><Badge>BORRADOR · NO ENVIADO</Badge></div>
    <h2>Propuesta comercial</h2><p>Preparada para <strong>{c?.name}</strong></p><p className="hint">RUC {c?.ruc || 'por completar'} · Vigente hasta {dateLabel(q.validUntil)}</p>
    <div className="table-wrap"><table><thead><tr><th>Servicio</th><th>Cantidad</th><th>Precio unitario</th></tr></thead><tbody><tr><td>{q.productName}</td><td>{q.quantity}</td><td>{money(q.unitPrice)}</td></tr></tbody></table></div>
    <dl className="quote-totals"><div><dt>Subtotal</dt><dd>{money(q.subtotal)}</dd></div><div><dt>Descuento ({q.discountPercent}%)</dt><dd>− {money(q.discountAmount)}</dd></div><div><dt>Impuesto ({q.taxPercent}%)</dt><dd>{money(q.taxAmount)}</dd></div><div className="total"><dt>Total de la propuesta</dt><dd>{money(q.total)}</dd></div></dl>
    <h3>Condiciones</h3><p className="preserve-lines">{q.terms || 'Condiciones pendientes de acordar con el cliente.'}</p><p className="hint">{q.number} · v{q.version} · Preparada el {dateLabel(q.createdAt)}. Este documento no acredita pago ni certificación.</p></div>
    <footer><button onClick={onClose}>Cerrar</button><button className="primary" onClick={() => window.print()}><Icon name="file" /> Imprimir / guardar PDF</button></footer></Modal>
}

export { default as Catalog } from './Catalog'

export function SettingsPage() {
  const { session } = useCRM()
  return <><PageHead title="Espacio e integraciones" description="Qué puedes usar hoy y qué falta conectar." />
    <section className="panel settings-panel"><h2>Estado del espacio</h2><div className="integration-row"><div><strong>Persistencia comercial</strong><p>{session.mode === 'demo' ? 'Espacio de prueba local con datos ficticios. Los cambios se guardan en este equipo.' : 'Espacio comercial conectado a Supabase.'}</p></div><Badge tone="green">{session.mode === 'demo' ? 'Prueba local' : 'Supabase'}</Badge></div>
      {[['Captación desde LiciHub', 'La API receptora está preparada. Falta conectar los eventos de solicitudes y desbloqueos de LiciHub.'], ['Bot de Telegram', 'El bot de LiciHub existente continúa separado. Su conexión al flujo comercial está pendiente.'], ['WhatsApp y correo', 'Puedes registrar su origen y actividades. La bandeja y los envíos no están conectados.'], ['Postventa y comisiones', 'Renovaciones, cobros, entrega y reglas de comisión pendientes de implementación.']].map(([name, detail]) => <div className="integration-row" key={name}><div><strong>{name}</strong><p>{detail}</p></div><Badge tone="amber">Pendiente</Badge></div>)}</section>
    <div className="info-strip"><Icon name="file" />El alcance y los pasos de activación están documentados en README.md y docs/ESTADO.md del proyecto.</div></>
}
