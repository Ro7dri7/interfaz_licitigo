import { useState } from 'react'
import { CommandForm, Modal } from './components'
import { useCRM } from './crm-context'
import { originLabel, evidenceLabels, kindLabels, money, origins } from './types'
import type { Deal } from './types'
import QuoteForm from './QuoteForm'

export function IntakeForm({ onClose }: { onClose: () => void }) {
  const { session, snapshot: { data } } = useCRM()
  const owners = [...new Set(['Sin asignar', ...(session.advisors ?? []), ...data.deals.map(d => d.owner)])]
  const [kind, setKind] = useState('advice')
  return <Modal title="Nuevo negocio" onClose={onClose}><CommandForm operation="intake" onClose={onClose} label="Crear negocio" prepare={f => ({ ...Object.fromEntries(f), deadline: f.get('deadline') || null })}>
    <p className="form-intro">Registra la solicitud del cliente y su procedencia. Se creará un negocio con una tarea de primera atención.</p>
    <div className="form-grid"><label>Empresa *<input name="company" required minLength={2} maxLength={160} placeholder="Razón social o nombre comercial" /></label>
    <label>RUC<input name="ruc" inputMode="numeric" pattern="[0-9]{11}" maxLength={11} placeholder="11 dígitos · opcional" /></label>
    <label>Persona de contacto<input name="contact" maxLength={100} placeholder="Nombre y apellido" /></label><label>Correo<input name="email" type="email" placeholder="nombre@empresa.com" /></label>
    <label>Teléfono<input name="phone" type="tel" maxLength={30} placeholder="+51" /></label><label>Responsable<select name="owner" defaultValue="Sin asignar">{owners.map(owner => <option key={owner}>{owner}</option>)}</select></label>
    <label>Origen<select name="origin" defaultValue="Manual">{origins.map(v => <option key={v} value={v}>{originLabel(v)}</option>)}</select></label>
    <label>Tipo de entrada<select name="kind" value={kind} onChange={e => setKind(e.target.value)}>{Object.entries(kindLabels).filter(([value]) => ['advice', 'quote'].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    <label>Servicio de interés *<input name="service" required minLength={2} maxLength={160} placeholder="Ej. ISO 9001" list="services" /></label>
    <details><summary>Contexto de la licitación</summary><div className="form-grid">
      <label>Análisis<select name="evidence" defaultValue="none">{Object.entries(evidenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Código de licitación<input name="tender" maxLength={160} placeholder="Código del proceso" /></label><label>Plazo del proceso<input name="deadline" type="date" /></label>
    </div><p className="hint">Un requisito detectado no confirma que la empresa carezca de la certificación.</p></details>
    <label>Notas<textarea name="notes" rows={3} maxLength={3000} placeholder="¿Qué necesita esta empresa?" /></label>
  </CommandForm></Modal>
}

export function ProductForm({ onClose }: { onClose: () => void }) {
  const [price, setPrice] = useState('')
  return <Modal title="Nuevo producto" onClose={onClose}><CommandForm operation="product" onClose={onClose} label="Guardar producto" prepare={f => ({
    name: f.get('name'), price: f.get('price'), active: f.get('active') === 'true',
  })}>
    <p className="form-intro">Registra una certificación ISO o un paquete. Incluye en el nombre la modalidad, el tamaño de empresa y si corresponde a certificación inicial, recertificación o seguimiento. Este catálogo no admite cursos.</p>
    <label>Nombre del producto *<input name="name" required minLength={2} maxLength={160} placeholder="ISO 9001:2015 - Certificación inicial Micro Empresa (Virtual)" /></label>
    <div className="form-grid"><label>Precio con IGV incluido *<input name="price" type="number" min="0" max="10000000" step="0.01" required value={price} onChange={e => setPrice(e.target.value)} /></label>
      <label>Moneda<input value="PEN · Sol peruano" readOnly /></label>
      <label>Estado del producto<select name="active" defaultValue="true"><option value="true">Activo · disponible para cotizar</option><option value="false">Inactivo · no disponible para cotizar</option></select></label></div>
    <div className="quote-estimate"><span>Precio unitario final, con IGV incluido</span><strong>{money(Math.round(Number(price || 0) * 100))}</strong></div>
    <p className="hint">Crear el producto no cambia los precios de cotizaciones anteriores. Los productos inactivos no se pueden añadir a nuevas propuestas.</p>
  </CommandForm></Modal>
}

export function DealForm({ deal, type, onClose }: { deal: Deal; type: string; onClose: () => void }) {
  if (type === 'quote') return <QuoteForm deal={deal} onClose={onClose} />
  if (type === 'task') return <Modal title="Programar próxima acción" onClose={onClose}><CommandForm operation="task" onClose={onClose} prepare={f => ({ title: f.get('title'), dueAt: new Date(String(f.get('dueAt'))).toISOString(), dealId: deal.id })}>
    <label>Tarea *<input name="title" required minLength={2} maxLength={200} placeholder="Ej. Confirmar alcance de la certificación" /></label>
    <label>Fecha y hora *<input name="dueAt" type="datetime-local" required /></label><p className="hint">Ingresa la hora local de este equipo. La agenda muestra hora de Perú.</p>
  </CommandForm></Modal>
  if (type === 'lost') return <Modal title="Registrar pérdida" onClose={onClose}><CommandForm operation="stage" onClose={onClose} label="Marcar como perdido" prepare={f => ({ dealId: deal.id, stage: 'lost', reason: f.get('reason') })}>
    <label>Motivo de pérdida *<textarea name="reason" required minLength={2} maxLength={1000} rows={4} placeholder="Registra qué impidió cerrar la venta" /></label>
  </CommandForm></Modal>
  return <Modal title="Registrar actividad" onClose={onClose}><CommandForm operation="activity" onClose={onClose} prepare={f => ({ ...Object.fromEntries(f), dealId: deal.id })}>
    <label>Tipo<select name="kind"><option value="note">Nota</option><option value="call">Llamada realizada</option><option value="meeting">Reunión realizada</option></select></label>
    <label>Detalle *<textarea name="text" required minLength={2} rows={5} maxLength={3000} placeholder="Deja contexto para el siguiente contacto…" /></label>
    <p className="hint">Esta acción registra lo ocurrido; no realiza llamadas ni envía mensajes.</p>
  </CommandForm></Modal>
}
