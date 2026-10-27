import { useRef, useState } from 'react'
import { Badge, Icon, Modal } from './components'
import { useCRM } from './crm-context'
import { dateTime, money, quoteStatusLabels } from './types'
import type { Quote, QuoteEvent } from './types'

const documentDate = (value: string) => new Intl.DateTimeFormat('es-PE', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Lima',
}).format(new Date(value.length === 10 ? value + 'T12:00:00-05:00' : value))

export default function QuoteDocument({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const { snapshot, session, command, now } = useCRM(), data = snapshot.data
  const q = data.quotes.find(item => item.id === quote.id) ?? quote
  const deal = data.deals.find(d => d.id === q.dealId), company = data.companies.find(c => c.id === deal?.companyId)
  const [action, setAction] = useState<QuoteEvent['status'] | ''>(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [recipient, setRecipient] = useState(q.contactEmail || q.contactName || ''), [channel, setChannel] = useState('email'), [note, setNote] = useState('')
  const requestId = useRef(crypto.randomUUID())
  const expired = new Date(q.validUntil + 'T23:59:59-05:00').getTime() < now
  const writable = (session.mode === 'demo' || (snapshot.schemaVersion ?? 1) >= 2) && !['won', 'lost'].includes(deal?.stage ?? '')
  const events = q.events ?? []
  const begin = (next: QuoteEvent['status']) => { setAction(next); setError(''); setNote(''); requestId.current = crypto.randomUUID() }
  return <Modal title={`${q.number} · versión ${q.version}`} onClose={onClose} wide>
    <article className="quote-sheet">
      <div className="quote-letterhead"><div><div className="brand">LiciHub<span>.</span><small>PROPUESTA COMERCIAL</small></div><p className="document-issuer">{q.issuerName || session.issuer?.name || 'INTERCERT LATAM S.A.C.'}</p><p>RUC {q.issuerRuc || session.issuer?.ruc || '20612137880'}</p></div>
        <div className="quote-reference"><strong>{q.number}</strong><span>Versión {q.version}</span><Badge tone={q.status === 'accepted' ? 'green' : q.status === 'sent' ? 'blue' : ''}>{quoteStatusLabels[q.status]}</Badge></div></div>
      <p className="issuer-address">{q.issuerAddress || session.issuer?.address}</p>
      <h2>Cotización comercial</h2><p className="quote-title">{q.title || deal?.service}</p>
      <div className="quote-parties"><section><h3>Preparada para</h3><strong>{q.customerName || company?.name}</strong><p>RUC {q.customerRuc || company?.ruc || 'por completar'}</p>{q.contactName && <p>Atención: {q.contactName}</p>}{q.contactEmail && <p>{q.contactEmail}</p>}</section>
        <section><h3>Datos de la propuesta</h3><p>Emitida: {documentDate(q.createdAt)}</p><p>Vigente hasta: {documentDate(q.validUntil)}</p><p>Asesor: {q.owner || deal?.owner}</p><p>Moneda: PEN · Sol peruano</p></section></div>
      <div className="table-wrap"><table className="quote-item-table"><thead><tr><th>N.º</th><th>Certificación / servicio</th><th>Cant.</th><th>Precio unitario</th><th>Importe</th></tr></thead><tbody>{q.items.map((item, index) => <tr key={index}>
        <td>{index + 1}</td><td>{item.productName}</td><td>{item.quantity}</td><td>{money(item.unitPrice)}</td><td>{money(item.unitPrice * item.quantity)}</td></tr>)}</tbody></table></div>
      <p className="hint">{q.taxIncluded ? 'Los precios de las partidas incluyen el impuesto indicado; el desglose no aumenta el total.' : 'Los precios de las partidas son importes antes del impuesto indicado.'}</p>
      <dl className="quote-totals"><div><dt>{q.taxIncluded ? 'Importe de partidas, IGV incluido' : 'Subtotal'}</dt><dd>{money(q.subtotal)}</dd></div>
        <div><dt>Descuento ({q.discountPercent} %)</dt><dd>− {money(q.discountAmount)}</dd></div>
        {q.taxIncluded && <div><dt>Base sin impuesto</dt><dd>{money(q.total - q.taxAmount)}</dd></div>}
        <div><dt>IGV / impuesto ({q.taxPercent} %){q.taxIncluded ? ' incluido' : ''}</dt><dd>{money(q.taxAmount)}</dd></div>
        <div className="total"><dt>Total de la propuesta</dt><dd>{money(q.total)}</dd></div></dl>
      <section className="quote-conditions"><h3>Alcance, condiciones comerciales y de pago</h3><p className="preserve-lines">{q.terms || 'Condiciones pendientes de acordar con el cliente.'}</p></section>
      {q.status === 'accepted' && events.at(-1) && <section className="quote-acceptance"><h3>Aceptación registrada</h3><p>{events.at(-1)?.recipient} · {dateTime(events.at(-1)!.createdAt)}</p><p className="preserve-lines">{events.at(-1)?.note}</p></section>}
      <div className="quote-document-footer"><strong>{q.issuerName || session.issuer?.name}</strong><p>{q.number} · v{q.version} · Este documento es una propuesta comercial; no acredita pago ni certificación.</p></div>
    </article>
    <section className="quote-management"><div className="section-head"><h3>Seguimiento de la propuesta</h3>{expired && q.status !== 'accepted' && <Badge tone="amber">Vigencia vencida</Badge>}</div>
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
    <footer><button onClick={onClose}>Cerrar</button><button className="primary" onClick={() => window.print()}><Icon name="file" /> Imprimir / guardar PDF</button></footer>
  </Modal>
}
