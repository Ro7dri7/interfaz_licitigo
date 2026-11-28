import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, CommandForm, Empty, Icon, Modal, PageHead } from './components'
import { useCRM } from './crm-context'
import { propertyEntityLabels, propertyTypeLabels } from './types'
import type { PropertyEntity, PropertyType } from './types'
import { crmPath } from './paths'

function PropertyForm({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<PropertyType>('text')
  return <Modal title="Nueva propiedad" onClose={onClose}><CommandForm operation="property_create" onClose={onClose} label="Crear propiedad"
    prepare={f => ({ entity: f.get('entity'), name: f.get('name'), type, options: type === 'select' ? String(f.get('options') ?? '').split('\n').map(o => o.trim()).filter(Boolean) : [] })}>
    <p className="form-intro">Crea un campo propio para tus negocios, empresas o contactos. Después podrás llenarlo en cada ficha y usarlo como filtro en el panel.</p>
    <div className="form-grid"><label>Se usa en *<select name="entity" defaultValue="company">{(Object.keys(propertyEntityLabels) as PropertyEntity[]).map(e => <option key={e} value={e}>{propertyEntityLabels[e]}</option>)}</select></label>
      <label>Tipo<select value={type} onChange={e => setType(e.target.value as PropertyType)}>{(Object.keys(propertyTypeLabels) as PropertyType[]).map(t => <option key={t} value={t}>{propertyTypeLabels[t]}</option>)}</select></label></div>
    <label>Nombre *<input name="name" required minLength={2} maxLength={60} placeholder="Ej. Sector, Tamaño de empresa, Canal de pago" /></label>
    {type === 'select' && <label>Opciones * (una por línea)<textarea name="options" rows={5} required placeholder={'Construcción\nMinería\nServicios'} /></label>}
  </CommandForm></Modal>
}

export default function AdminProperties() {
  const { snapshot: { data, schemaVersion }, session, command } = useCRM()
  const [creating, setCreating] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState('')
  const ready = session.mode === 'demo' || (schemaVersion ?? 1) >= 3
  const records = { deal: data.deals, company: data.companies, contact: data.contacts }
  async function toggle(id: string, active: boolean) {
    setBusy(id); setError('')
    try { await command('property_archive', { propertyId: id, active }) } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }
  return <><Link className="association-link" to={crmPath("/admin")}><Icon name="back" size={14} />Volver al panel</Link>
    <PageHead eyebrow="ADMINISTRACIÓN" title="Propiedades personalizadas" description="Campos propios para negocios, empresas y contactos. Solo administración puede crearlos, llenarlos y filtrar con ellos.">
      <button className="primary" disabled={!ready} onClick={() => setCreating(true)}><Icon name="plus" /> Nueva propiedad</button></PageHead>
    {!ready && <p className="hint">Actualización pendiente: ejecuta 010_propiedades.sql en Supabase para habilitar las propiedades.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="stack">{(Object.keys(propertyEntityLabels) as PropertyEntity[]).map(entity => {
      const list = data.properties.filter(p => p.entity === entity)
      return <section className="panel" key={entity} aria-label={`Propiedades de ${propertyEntityLabels[entity].toLocaleLowerCase()}`}><div className="section-head"><div><h2>{propertyEntityLabels[entity]}</h2><p>Se llenan desde la ficha de cada registro.</p></div><Badge>{list.length}</Badge></div>
        {list.length ? <div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Tipo</th><th>Opciones</th><th>Con valor</th><th></th></tr></thead><tbody>{list.map(p => <tr key={p.id} className={p.active ? '' : 'archived'}>
          <td><strong>{p.name}</strong>{!p.active && <small>Archivada</small>}</td><td>{propertyTypeLabels[p.type]}</td><td>{p.options.length ? p.options.join(', ') : '—'}</td>
          <td>{records[entity].filter(r => r.props?.[p.id]).length} de {records[entity].length}</td>
          <td><button type="button" disabled={busy === p.id} onClick={() => void toggle(p.id, !p.active)}>{p.active ? 'Archivar' : 'Activar'}</button></td></tr>)}</tbody></table></div>
          : <Empty title={`Sin propiedades de ${propertyEntityLabels[entity].toLocaleLowerCase()}`}>Crea una con «Nueva propiedad».</Empty>}</section>
    })}</div>
    <p className="hint">Archivar una propiedad la oculta de las fichas y los filtros, pero conserva los valores ya guardados.</p>
    {creating && <PropertyForm onClose={() => setCreating(false)} />}</>
}
