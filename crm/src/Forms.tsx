import { useState } from 'react'
import { CommandForm, Modal } from './components'
import { useCRM } from './crm-context'
import { originLabel, evidenceLabels, kindLabels, money, origins, priorityLabels } from './types'
import type { Contact, Deal } from './types'
import QuoteForm from './QuoteForm'
import { ownerOptions } from './utils'

// «Nuevo negocio» en panel lateral (como el de HubSpot): datos del negocio, empresa asociada, contacto y contexto.
export function IntakeForm({ onClose }: { onClose: () => void }) {
  const { session, snapshot: { data } } = useCRM()
  const me = session.user.role === 'commercial' ? session.user.name : ''
  const owners = ['Sin asignar', ...ownerOptions(session.advisors, data.deals, me)]
  const [company, setCompany] = useState(''), [ruc, setRuc] = useState('')
  // El backend asocia el negocio a una empresa existente por su RUC; sin RUC registra una empresa nueva.
  const byRuc = ruc.length === 11 ? data.companies.find(c => c.ruc === ruc) : undefined
  const byName = data.companies.find(c => c.name.trim().toLocaleLowerCase() === company.trim().toLocaleLowerCase())
  const association = byRuc ? { tone: 'ok', text: `Se asociará a la empresa registrada «${byRuc.name}».` }
    : byName && !ruc ? { tone: 'warn', text: byName.ruc ? `«${byName.name}» ya está registrada con RUC ${byName.ruc}. Escribe el RUC para asociar el negocio a esa empresa.` : `«${byName.name}» ya existe sin RUC. Sin RUC se registrará como una empresa nueva.` }
      : byName && byName.ruc && byName.ruc !== ruc && ruc.length === 11 ? { tone: 'warn', text: `El RUC no coincide con «${byName.name}» (RUC ${byName.ruc}). Se registrará otra empresa.` } : null
  const pickCompany = (value: string) => {
    setCompany(value)
    const match = data.companies.find(c => c.name.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase())
    if (match?.ruc && !ruc) setRuc(match.ruc)
  }
  return <Modal drawer title="Nuevo negocio" description="Registra la solicitud del cliente y su procedencia. Se creará un negocio en la etapa Nuevo con una tarea de primera atención." onClose={onClose}>
    <CommandForm operation="intake" onClose={onClose} label="Crear negocio" another="Crear y agregar otro" savedMessage="Negocio creado. Puedes registrar el siguiente."
      onReset={() => { setCompany(''); setRuc('') }} prepare={f => ({ ...Object.fromEntries(f), deadline: f.get('deadline') || null })}>
      <section className="form-section" aria-labelledby="intake-deal"><h3 id="intake-deal">Negocio</h3>
        <label>Servicio de interés *<input name="service" required minLength={2} maxLength={160} placeholder="Ej. ISO 9001" list="services" autoComplete="off" data-autofocus /></label>
        <div className="form-grid"><label>Tipo de entrada<select name="kind" defaultValue="advice">{Object.entries(kindLabels).filter(([value]) => ['advice', 'quote'].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Origen<select name="origin" defaultValue="Manual">{origins.map(v => <option key={v} value={v}>{originLabel(v)}</option>)}</select></label></div>
        <label>Responsable<select name="owner" defaultValue={me || 'Sin asignar'}>{owners.map(owner => <option key={owner} value={owner}>{owner === me ? `${owner} (tú)` : owner}</option>)}</select></label>
      </section>
      <section className="form-section" aria-labelledby="intake-company"><h3 id="intake-company">Empresa</h3>
        <label>Empresa *<input name="company" required minLength={2} maxLength={160} placeholder="Razón social o nombre comercial" list="intake-companies" autoComplete="off" value={company} onChange={e => pickCompany(e.target.value)} /></label>
        <datalist id="intake-companies">{data.companies.map(c => <option key={c.id} value={c.name}>{c.ruc ? `RUC ${c.ruc}` : 'Sin RUC'}</option>)}</datalist>
        <label>RUC<input name="ruc" inputMode="numeric" pattern="[0-9]{11}" maxLength={11} placeholder="11 dígitos · opcional" title="El RUC tiene 11 dígitos" value={ruc} onChange={e => setRuc(e.target.value.replace(/\D/g, ''))} /></label>
        {association && <p className={`association-hint ${association.tone}`} role="status">{association.text}</p>}
      </section>
      <section className="form-section" aria-labelledby="intake-contact"><h3 id="intake-contact">Contacto</h3>
        <label>Persona de contacto<input name="contact" maxLength={100} placeholder="Nombre y apellido" autoComplete="off" /></label>
        <div className="form-grid"><label>Correo<input name="email" type="email" placeholder="nombre@empresa.com" autoComplete="off" /></label>
          <label>Teléfono<input name="phone" type="tel" maxLength={30} placeholder="+51" pattern="[+0-9\s\(\)\-]*" title="Solo números, espacios, +, ( ) y -" autoComplete="off" /></label></div>
      </section>
      <details className="form-section"><summary>Contexto de la licitación</summary><div className="form-grid">
        <label>Análisis<select name="evidence" defaultValue="none">{Object.entries(evidenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Plazo del proceso<input name="deadline" type="date" /></label></div>
        <label>Código de licitación<input name="tender" maxLength={160} placeholder="Código del proceso" /></label>
        <p className="hint">Un requisito detectado no confirma que la empresa carezca de la certificación.</p></details>
      <label>Notas<textarea name="notes" rows={4} maxLength={3000} placeholder="¿Qué necesita esta empresa?" /></label>
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

export function ContactForm({ contact, companyId, onClose }: { contact?: Contact; companyId?: string; onClose: () => void }) {
  const { snapshot: { data } } = useCRM(), editing = Boolean(contact)
  const companies = data.companies.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return <Modal title={editing ? 'Editar contacto' : 'Nuevo contacto'} onClose={onClose}><CommandForm operation={editing ? 'contact_edit' : 'contact_create'} onClose={onClose} label="Guardar contacto"
    prepare={f => ({ ...(contact ? { contactId: contact.id } : { companyId: f.get('companyId') }), name: f.get('name'), email: f.get('email') ?? '', phone: f.get('phone') ?? '' })}>
    {!editing && <label>Empresa *<select name="companyId" required defaultValue={companyId ?? ''}><option value="" disabled>Selecciona la empresa</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}{c.ruc ? ` · ${c.ruc}` : ''}</option>)}</select></label>}
    <label>Nombre y apellido *<input name="name" required minLength={2} maxLength={100} defaultValue={contact?.name} placeholder="Ej. Ana Torres" /></label>
    <div className="form-grid"><label>Correo<input name="email" type="email" defaultValue={contact?.email} placeholder="nombre@empresa.com" /></label>
      <label>Teléfono<input name="phone" type="tel" maxLength={30} defaultValue={contact?.phone} placeholder="+51" /></label></div>
    <p className="hint">Una empresa puede tener varios contactos. El correo no puede repetirse dentro de la misma empresa.</p>
  </CommandForm></Modal>
}

export function DealForm({ deal, type, onClose }: { deal: Deal; type: string; onClose: () => void }) {
  if (type === 'quote') return <QuoteForm deal={deal} onClose={onClose} />
  if (type === 'task') return <Modal title="Programar próxima acción" onClose={onClose}><CommandForm operation="task" onClose={onClose} prepare={f => ({ title: f.get('title'), dueAt: new Date(String(f.get('dueAt'))).toISOString(), dealId: deal.id })}>
    <label>Tarea *<input name="title" required minLength={2} maxLength={200} placeholder="Ej. Confirmar alcance de la certificación" /></label>
    <label>Fecha y hora *<input name="dueAt" type="datetime-local" required /></label><p className="hint">Ingresa la hora local de este equipo. La agenda muestra hora de Perú.</p>
  </CommandForm></Modal>
  if (type === 'contact') return <Modal title="Agregar contacto" onClose={onClose}><CommandForm operation="contact" onClose={onClose} label="Guardar contacto" prepare={f => ({ dealId: deal.id, name: f.get('name'), email: f.get('email') ?? '', phone: f.get('phone') ?? '' })}>
    <p className="form-intro">Persona de la empresa con quien conversas por este negocio. Si el correo ya está registrado en la empresa, se reutiliza ese contacto.</p>
    <label>Nombre y apellido *<input name="name" required minLength={2} maxLength={100} placeholder="Ej. Ana Torres" /></label>
    <div className="form-grid"><label>Correo<input name="email" type="email" placeholder="nombre@empresa.com" /></label>
      <label>Teléfono<input name="phone" type="tel" maxLength={30} placeholder="+51" /></label></div>
  </CommandForm></Modal>
  if (type === 'details') return <Modal title="Prioridad y cierre esperado" onClose={onClose}><CommandForm operation="deal_details" onClose={onClose} prepare={f => ({ dealId: deal.id, priority: f.get('priority'), expectedClose: f.get('expectedClose') || null })}>
    <div className="form-grid"><label>Prioridad<select name="priority" defaultValue={deal.priority ?? 'normal'}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Cierre esperado<input name="expectedClose" type="date" defaultValue={deal.expectedClose ?? ''} /></label></div>
    <p className="hint">La fecha es tu estimación de cuándo se cierra la venta; no es un plazo del cliente.</p>
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
