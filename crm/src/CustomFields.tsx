import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCRM } from './crm-context'
import type { Property, PropertyEntity } from './types'
import { crmPath } from './paths'

const titles: Record<PropertyEntity, string> = { deal: 'del negocio', company: 'de la empresa', contact: 'del contacto' }

function FieldInput({ prop, value, busy, onSave }: { prop: Property; value: string; busy: boolean; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  if (prop.type === 'select') return <>
    <input aria-label={prop.name} list={`opciones-${prop.id}`} value={draft} disabled={busy} maxLength={60} placeholder="Escribe o elige" onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft !== value) onSave(draft) }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
    <datalist id={`opciones-${prop.id}`}>{prop.options.map(o => <option key={o} value={o} />)}</datalist>
  </>
  return <input aria-label={prop.name} type={prop.type === 'number' ? 'number' : prop.type === 'date' ? 'date' : 'text'} step={prop.type === 'number' ? 'any' : undefined} maxLength={200}
    value={draft} disabled={busy} onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft !== value) onSave(draft) }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
}

// Propiedades creadas por administración. Solo ellas las ven y las editan; el resto del equipo no recibe estos datos.
export default function CustomFields({ entity, recordId }: { entity: PropertyEntity; recordId: string }) {
  const { session, snapshot: { data }, command } = useCRM(), [error, setError] = useState(''), [busy, setBusy] = useState('')
  const props = data.properties.filter(p => p.entity === entity && p.active)
  if (session.user.role !== 'admin' || !props.length) return null
  const record = (entity === 'deal' ? data.deals : entity === 'company' ? data.companies : data.contacts).find(r => r.id === recordId)
  if (!record) return null
  async function save(prop: Property, value: string) {
    setBusy(prop.id); setError('')
    try { await command('property_set', { propertyId: prop.id, recordId, value }) } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }
  return <section className="panel custom-fields" aria-label={`Propiedades personalizadas ${titles[entity]}`}>
    <div className="section-head"><div><h2>Propiedades {titles[entity]}</h2><p>Solo visibles para administración.</p></div><Link className="text-link" to={crmPath("/admin/propiedades")}>Administrar</Link></div>
    <div className="aside-content custom-fields-body">{props.map(p => <label key={p.id}>{p.name}<FieldInput key={`${p.id}:${record.props?.[p.id] ?? ''}`} prop={p} value={record.props?.[p.id] ?? ''} busy={busy === p.id} onSave={value => void save(p, value)} /></label>)}
      {error && <p className="error" role="alert">{error}</p>}</div></section>
}
