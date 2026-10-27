import { useState } from 'react'
import { CommandForm, Icon, Modal } from './components'
import { useCRM } from './crm-context'
import { money } from './types'
import type { Deal } from './types'

export default function QuoteForm({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const { snapshot: { data } } = useCRM()
  const [search, setSearch] = useState(''), [discount, setDiscount] = useState(0), [tax, setTax] = useState(18), [included, setIncluded] = useState(true)
  const [lines, setLines] = useState([{ key: crypto.randomUUID(), productId: '', quantity: 1 }])
  const choices = data.products.filter(p => p.active && `${p.name} ${p.sku ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const subtotal = lines.reduce((sum, line) => sum + (data.products.find(p => p.id === line.productId)?.price ?? 0) * line.quantity, 0)
  const discountAmount = Math.round(subtotal * discount / 100)
  const taxAmount = Math.round((subtotal - discountAmount) * tax / (included ? 100 + tax : 100))
  const total = subtotal - discountAmount + (included ? 0 : taxAmount)
  const update = (index: number, change: Partial<(typeof lines)[number]>) => setLines(previous => previous.map((line, i) => i === index ? { ...line, ...change } : line))
  return <Modal title="Preparar cotización" onClose={onClose} wide><CommandForm operation="quote" onClose={onClose} label="Guardar borrador" prepare={form => ({
    dealId: deal.id, title: form.get('title'), items: lines.map(({ productId, quantity }) => ({ productId, quantity })),
    discount: String(discount), tax: String(tax), taxIncluded: included, validUntil: form.get('validUntil'), terms: form.get('terms'),
  })}>
    <p className="form-intro">Combina certificaciones individuales y paquetes. Cada versión conserva precios, destinatario y condiciones. El borrador no envía mensajes.</p>
    <label>Nombre de la propuesta<input name="title" defaultValue={deal.service} maxLength={160} required /></label>
    <label>Buscar en catálogo<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="ISO, modalidad, tamaño de empresa o código…" /></label>
    <div className="quote-lines">{lines.map((line, index) => {
      const product = data.products.find(p => p.id === line.productId)
      const options = product && !choices.some(p => p.id === product.id) ? [product, ...choices] : choices
      return <fieldset className="quote-line" key={line.key}><legend>Partida {index + 1}</legend>
        <label>Certificación o paquete *<select aria-label={`Servicio de la partida ${index + 1}`} value={line.productId} onChange={e => update(index, { productId: e.target.value })} required>
          <option value="">Selecciona un servicio</option>{options.map(p => <option key={p.id} value={p.id}>{p.isPackage ? 'PAQUETE · ' : ''}{p.name}</option>)}</select></label>
        <div className="quote-line-detail"><label>Cantidad<input aria-label={`Cantidad de la partida ${index + 1}`} type="number" min="1" max="1000" step="1" required value={line.quantity} onChange={e => update(index, { quantity: Number(e.target.value) })} /></label>
          <div><small>Precio unitario</small><strong>{money(product?.price ?? 0)}</strong></div><div><small>Importe</small><strong>{money((product?.price ?? 0) * line.quantity)}</strong></div>
          <button type="button" disabled={lines.length === 1} aria-label={`Eliminar partida ${index + 1}`} onClick={() => setLines(previous => previous.filter((_, i) => i !== index))}><Icon name="close" /></button></div>
        {product?.isPackage && <p className="hint">El precio corresponde al paquete completo del catálogo.</p>}
      </fieldset>
    })}</div>
    <button type="button" disabled={lines.length >= 50} onClick={() => setLines(previous => [...previous, { key: crypto.randomUUID(), productId: '', quantity: 1 }])}><Icon name="plus" /> Añadir certificación o servicio</button>
    {!data.products.length && <p className="hint">Importa primero las certificaciones desde Catálogo.</p>}
    <div className="form-grid"><label>Descuento (%)<input name="discount" type="number" min="0" max="100" step="0.01" value={discount} onChange={e => setDiscount(Number(e.target.value))} required /></label>
      <label>IGV / impuesto (%)<input name="tax" type="number" min="0" max="100" step="0.01" value={tax} onChange={e => setTax(Number(e.target.value))} required /></label>
      <label>Válida hasta<input name="validUntil" type="date" required /></label></div>
    <label className="checkbox-label"><input type="checkbox" checked={included} onChange={e => setIncluded(e.target.checked)} /> Los precios incluyen IGV / impuesto</label>
    <div className="quote-estimate"><span>{included ? 'IGV incluido, sin recargo adicional' : 'Impuesto agregado al importe neto'}</span><strong>Total estimado: {money(total)}</strong><small>El servidor confirma el cálculo y redondeo al guardar.</small></div>
    <label>Condiciones comerciales y de pago *<textarea name="terms" rows={4} minLength={2} maxLength={4000} required placeholder="Forma de pago, alcance, entregables, plazos y exclusiones acordadas" /></label>
  </CommandForm></Modal>
}
