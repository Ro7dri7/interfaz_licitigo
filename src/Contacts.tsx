import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Badge, Empty, Icon, PageHead } from './components'
import { Filters } from './Collections'
import { ContactForm } from './Forms'
import { useCRM } from './crm-context'
import { initials, openDeal } from './types'
import { downloadCsv, limaDay, whatsappNumber } from './utils'

const orders = [['nombre', 'Nombre (A-Z)'], ['empresa', 'Empresa (A-Z)'], ['negocios', 'Más negocios abiertos']]
const dataFilters = [['', 'Todos los datos'], ['sincorreo', 'Sin correo'], ['sintelefono', 'Sin teléfono'], ['conabiertos', 'Con negocios abiertos'], ['sinabiertos', 'Sin negocios abiertos']]

export default function Contacts({ onCreate }: { onCreate: () => void }) {
  const { snapshot: { data }, now } = useCRM(), [params, setParams] = useSearchParams(), location = useLocation(), [creating, setCreating] = useState(false)
  const query = (params.get('q') ?? '').toLocaleLowerCase(), companyId = params.get('empresa'), filter = params.get('datos') ?? ''
  const order = orders.some(([id]) => id === params.get('orden')) ? params.get('orden')! : 'nombre'
  const setParam = (key: string, value: string) => setParams(p => { if (value) p.set(key, value); else p.delete(key); return p }, { replace: true })
  const companyById = new Map(data.companies.filter(c => (!companyId || c.id === companyId) && (!params.get('origen') || c.origin === params.get('origen'))).map(c => [c.id, c]))
  const owners = (id: string) => [...new Set([
    ...data.deals.filter(d => d.companyId === id).map(d => d.owner),
    ...data.prospects.filter(p => p.companyId === id).map(p => p.owner),
  ])].filter(owner => owner !== 'Sin asignar')
  const openCount = (id: string) => data.deals.filter(d => d.companyId === id && openDeal(d)).length
  const people = data.contacts.filter(p => {
    const c = companyById.get(p.companyId)
    return c && `${p.name} ${p.email} ${p.phone} ${c.name} ${c.ruc}`.toLocaleLowerCase().includes(query)
      && (filter !== 'sincorreo' || !p.email) && (filter !== 'sintelefono' || !p.phone)
      && (filter !== 'conabiertos' || openCount(c.id) > 0) && (filter !== 'sinabiertos' || openCount(c.id) === 0)
  }).sort((a, b) => order === 'empresa' ? (companyById.get(a.companyId)?.name ?? '').localeCompare(companyById.get(b.companyId)?.name ?? '', 'es')
    : order === 'negocios' ? openCount(b.companyId) - openCount(a.companyId) || a.name.localeCompare(b.name, 'es') : a.name.localeCompare(b.name, 'es'))
  const from = { from: location.pathname + location.search }
  const exportCsv = () => downloadCsv(`contactos-${limaDay(now)}.csv`, [['Persona', 'Empresa', 'RUC', 'Correo', 'Teléfono', 'Negocios abiertos', 'Asesores'],
    ...people.map(p => { const c = companyById.get(p.companyId)!; return [p.name, c.name, c.ruc, p.email, p.phone, openCount(c.id), owners(c.id).join(', ')] })])
  return <><PageHead title="Contactos" description="Personas con quienes conversas: correo, teléfono y la empresa a la que pertenecen.">
    <button onClick={exportCsv} disabled={!people.length}><Icon name="download" size={16} /> Exportar</button>
    <button onClick={onCreate}>Registrar prospecto</button>
    <button className="primary" onClick={() => setCreating(true)}><Icon name="plus" /> Nuevo contacto</button></PageHead>
    <div className="info-strip"><Icon name="users" />Una empresa puede tener varios contactos: compras, gerencia o administración. Cada persona conserva sus propios datos.</div>
    <Filters preserve={['orden', 'empresa']}><select aria-label="Filtrar por datos" value={filter} onChange={e => setParam('datos', e.target.value)}>{dataFilters.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select>
      <select aria-label="Ordenar contactos" value={order} onChange={e => setParam('orden', e.target.value === 'nombre' ? '' : e.target.value)}>{orders.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></Filters>
    {companyId && <div className="info-strip"><Icon name="company" /><span>Contactos de {companyById.get(companyId)?.name ?? 'la empresa seleccionada'}. <Link className="text-link" to="/contactos">Ver todos</Link></span></div>}
    <section className="panel table-wrap" aria-label="Lista de contactos">
      <table><thead><tr><th>Persona de contacto</th><th>Empresa</th><th>Correo</th><th>Teléfono</th><th>Negocios abiertos</th><th>Asesores de la empresa</th><th>Acciones</th></tr></thead><tbody>{people.map(person => {
        const company = companyById.get(person.companyId)!, open = openCount(company.id), wa = person.phone ? whatsappNumber(person.phone) : ''
        return <tr key={person.id}>
          <td><div className="person-cell"><span className="avatar small">{initials(person.name)}</span><Link className="record-button" to={`/contactos/${person.id}`}><strong>{person.name}</strong></Link></div></td>
          <td><Link className="record-button" state={from} to={`/directorio/empresas/${company.id}`}>{company.name}</Link><small>{company.ruc || 'RUC por completar'}</small></td>
          <td>{person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : 'Sin correo'}</td>
          <td>{person.phone ? <a href={`tel:${person.phone}`}>{person.phone}</a> : 'Sin teléfono'}</td>
          <td>{open ? <Badge tone="blue">{open} {open === 1 ? 'negocio abierto' : 'negocios abiertos'}</Badge> : <Badge>Sin negocios abiertos</Badge>}</td>
          <td>{owners(company.id).join(', ') || 'Sin asignar'}</td>
          <td><div className="row-actions"><Link className="qa" aria-label={`Abrir ficha de ${person.name}`} title="Abrir ficha" to={`/contactos/${person.id}`}><Icon name="users" size={14} /></Link>
            {person.phone && <a className="qa" aria-label={`Llamar a ${person.name}`} title="Llamar" href={`tel:${person.phone}`}><Icon name="phone" size={14} /></a>}
            {person.email && <a className="qa" aria-label={`Escribir a ${person.name}`} title="Correo" href={`mailto:${person.email}`}><Icon name="mail" size={14} /></a>}
            {wa && <a className="qa" aria-label={`WhatsApp a ${person.name}`} title="WhatsApp" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"><Icon name="chat" size={14} /></a>}</div></td></tr>
      })}</tbody></table>
      {!people.length && <Empty>No hay personas que coincidan con esos filtros.</Empty>}
      <div className="table-foot">{people.length} {people.length === 1 ? 'contacto' : 'contactos'} · Cada fila corresponde a una persona. Abre su ficha para ver sus negocios, cotizaciones y actividad.</div>
    </section>
    {creating && <ContactForm companyId={companyId ?? undefined} onClose={() => setCreating(false)} />}</>
}
