import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Icon, Modal } from './components'
import { useCRM } from './crm-context'
import { dateTime, money, quoteStatusLabels } from './types'
import type { Quote, QuoteEvent } from './types'
import { crmPath } from './paths'

const documentDate = (value: string) => new Intl.DateTimeFormat('es-PE', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Lima',
}).format(new Date(value.length === 10 ? value + 'T12:00:00-05:00' : value))

export default function QuoteDocument({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const { snapshot, session, command, now } = useCRM(), data = snapshot.data
  const q = data.quotes.find(item => item.id === quote.id) ?? quote
  const deal = data.deals.find(d => d.id === q.dealId), company = data.companies.find(c => c.id === deal?.companyId)
  // La cotización guarda el nombre y el correo del contacto al emitirse; con eso se ubica su ficha actual.
  const person = data.contacts.filter(c => c.companyId === deal?.companyId).find(c => q.contactEmail ? c.email.toLowerCase() === q.contactEmail.toLowerCase() : c.name === q.contactName)
  const [action, setAction] = useState<QuoteEvent['status'] | ''>(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [recipient, setRecipient] = useState(q.contactEmail || q.contactName || ''), [channel, setChannel] = useState('email'), [note, setNote] = useState('')
  const requestId = useRef(crypto.randomUUID())
  const expired = new Date(q.validUntil + 'T23:59:59-05:00').getTime() < now
  const writable = (session.mode === 'demo' || (snapshot.schemaVersion ?? 1) >= 2) && !['won', 'lost'].includes(deal?.stage ?? '')
  const events = q.events ?? []
  const begin = (next: QuoteEvent['status']) => { setAction(next); setError(''); setNote(''); requestId.current = crypto.randomUUID() }
  return <Modal title={`${q.number} · versión ${q.version}`} onClose={onClose} className="quote-dialog">
    <article className="quote-sheet">
      <header className="quote-letterhead">
        <div>
          <div className="brand">LiciHub<span>.</span><small>PROPUESTA COMERCIAL</small></div>
          <p className="document-issuer">{q.issuerName || session.issuer?.name || 'INTERCERT LATAM S.A.C.'}</p>
          <p>RUC {q.issuerRuc || session.issuer?.ruc || '20612137880'}</p>
        </div>
        <div className="quote-reference">
          <strong>{q.number}</strong>
          <span>Versión {q.version}</span>
          <span>Fecha {documentDate(q.createdAt)}</span>
          <span className="no-print"><Badge tone={q.status === 'accepted' ? 'green' : q.status === 'sent' ? 'blue' : ''}>{quoteStatusLabels[q.status]}</Badge></span>
        </div>
      </header>
      <p className="issuer-address">{q.issuerAddress || session.issuer?.address}</p>
      <h2>Cotización comercial</h2>
      <p className="quote-title">{q.title || deal?.service}</p>
      <div className="quote-parties">
        <section>
          <h3>Cliente</h3>
          <dl>
            <div><dt>Empresa</dt><dd>{q.customerName || company?.name || 'Por completar'}</dd></div>
            <div><dt>RUC</dt><dd>{q.customerRuc || company?.ruc || 'Por completar'}</dd></div>
            <div><dt>Contacto</dt><dd>{q.contactName || 'Por completar'}{q.contactEmail ? ` · ${q.contactEmail}` : ''}{person && <> · <Link className="text-link no-print" aria-label="Ver ficha del contacto" to={crmPath(`/contactos/${person.id}`)} onClick={onClose}>Ver ficha</Link></>}</dd></div>
            <div><dt>Asesor responsable</dt><dd>{q.owner || deal?.owner || 'Sin asignar'}</dd></div>
          </dl>
        </section>
        <section>
          <h3>Propuesta</h3>
          <dl>
            <div><dt>Número</dt><dd>{q.number}</dd></div>
            <div><dt>Emitida</dt><dd>{documentDate(q.createdAt)}</dd></div>
            <div><dt>Válida hasta</dt><dd>{documentDate(q.validUntil)}</dd></div>
            <div><dt>Moneda</dt><dd>Soles (PEN)</dd></div>
          </dl>
        </section>
      </div>
      <div className="table-wrap"><table className="quote-item-table"><thead><tr><th>N.º</th><th>Norma / servicio</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th></tr></thead><tbody>{q.items.map((item, index) => <tr key={index}>
        <td>{index + 1}</td><td>{item.productName}</td><td>{item.quantity}</td><td>{money(item.unitPrice)}</td><td>{money(item.unitPrice * item.quantity)}</td></tr>)}</tbody></table></div>
      <p className="hint no-print">{q.taxIncluded ? 'Los precios de las partidas incluyen el impuesto indicado; el desglose no aumenta el total.' : 'Los precios de las partidas son importes antes del impuesto indicado.'}</p>
      <dl className="quote-totals">
        <div><dt>Subtotal</dt><dd>{money(q.taxIncluded ? q.total - q.taxAmount : q.subtotal)}</dd></div>
        {q.discountAmount > 0 && <div><dt>Descuento ({q.discountPercent} %)</dt><dd>− {money(q.discountAmount)}</dd></div>}
        <div><dt>IGV ({q.taxPercent} %)</dt><dd>{money(q.taxAmount)}</dd></div>
        <div className="total"><dt>Total en soles (PEN)</dt><dd>{money(q.total)}</dd></div>
      </dl>
      <section className="quote-conditions"><h3>Alcance y condiciones</h3><p className="preserve-lines">{q.terms || 'Condiciones pendientes de acordar con el cliente.'}</p></section>
      {q.status === 'accepted' && events.at(-1) && <section className="quote-acceptance"><h3>Aceptación registrada</h3><p>{events.at(-1)?.recipient} · {dateTime(events.at(-1)!.createdAt)}</p><p className="preserve-lines">{events.at(-1)?.note}</p></section>}
      <footer className="quote-document-footer">
        <p>Vigencia de la propuesta: hasta {documentDate(q.validUntil)}.</p>
        <p>{q.number} · versión {q.version} · Importes en soles (PEN). Esta propuesta no acredita pago ni certificación.</p>
      </footer>
    </article>
    <section className="quote-management no-print"><div className="section-head"><h3>Seguimiento de la propuesta</h3>{expired && q.status !== 'accepted' && <Badge tone="amber">Vigencia vencida</Badge>}</div>
      <p className="hint">Registra lo realizado por correo, WhatsApp u otro canal. Estas acciones no envían mensajes ni firman por el cliente.</p>
      {!!events.length && <ol className="quote-event-list">{events.map(event => <li key={event.id}><strong>{quoteStatusLabels[event.status]}</strong><span>{event.recipient} · {event.channel} · {dateTime(event.createdAt)}</span><p>{event.note}</p><small>Registrado por {event.actor}</small></li>)}</ol>}
      {writable && !action && <div className="quote-state-actions">{q.status === 'draft' && <button disabled={expired} onClick={() => begin('sent')}>Registrar envío</button>}
        {q.status === 'sent' && <><button className="primary" disabled={expired} onClick={() => begin('accepted')}>Registrar aceptación</button><button onClick={() => begin('rejected')}>Registrar rechazo</button></>}</div>}
      {action && <form className="quote-state-form" onSubmit={async event => {
        event.preventDefault(); setBusy(true); setError('')
        try { await command('quote_status', { quoteId: q.id, status: action, recipient, channel, note }, requestId.current); setAction('') }
        catch (e) { setError((e as Error).message) } finally { setBusy(false) }
      }}><h3>{action === 'sent' ? 'Registrar envío realizado' : action === 'accepted' ? 'Registrar aceptación del cliente' : 'Registrar rechazo del cliente'}</h3>
        <div className="form-grid"><label>Destinatario o persona que confirmó<input required minLength={2} maxLength={254} value={recipient} onChange={e => setRecipient(e.target.value)} /></label>
          <label>Canal<select value={channel} onChange={e => setChannel(e.target.value)}><option value="email">Correo electrónico</option><option value="whatsapp">WhatsApp</option><option value="other">Otro canal</option></select></label></div>
        <label>Detalle o evidencia *<textarea required minLength={2} maxLength={2000} rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Referencia del correo, mensaje o confirmación recibida" /></label>
        {error && <p role="alert" className="error">{error}</p>}<div className="quote-state-actions"><button type="button" disabled={busy} onClick={() => setAction('')}>Cancelar registro</button><button type="submit" className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar registro'}</button></div></form>}
    </section>
    <footer className="no-print"><button type="button" onClick={onClose}>Cerrar</button><button type="button" className="primary" onClick={() => window.print()}><Icon name="file" /> Imprimir / guardar PDF</button></footer>
  </Modal>
}
