import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Badge, Empty, Icon, PageHead } from './components'
import { Filters } from './Collections'
import { useCRM } from './crm-context'
import { money, openDeal, originLabel } from './types'

export default function Directory({ onCreate }: { onCreate: () => void }) {
  const { snapshot: { data } } = useCRM(), [params] = useSearchParams(), location = useLocation()
  const contactsView = params.get('vista') === 'contactos'
  const query = (params.get('q') ?? '').toLocaleLowerCase(), companyId = params.get('empresa')
  const companies = data.companies.filter(c => (!companyId || c.id === companyId) && (!params.get('origen') || c.origin === params.get('origen')))
  const companyById = new Map(companies.map(company => [company.id, company]))
  const owners = (id: string) => [...new Set([
    ...data.deals.filter(d => d.companyId === id).map(d => d.owner),
    ...data.prospects.filter(p => p.companyId === id).map(p => p.owner),
  ])].filter(owner => owner !== 'Sin asignar')
  const rows = companies.filter(c => `${c.name} ${c.ruc} ${data.contacts.filter(p => p.companyId === c.id).map(p => `${p.name} ${p.email}`).join(' ')}`.toLocaleLowerCase().includes(query))
  const people = data.contacts.filter(p => {
    const c = companyById.get(p.companyId)
    return c && `${p.name} ${p.email} ${p.phone} ${c.name} ${c.ruc}`.toLocaleLowerCase().includes(query)
  })
  const viewUrl = (contacts: boolean) => {
    const next = new URLSearchParams(params)
    if (contacts) next.set('vista', 'contactos'); else next.delete('vista')
    return `/directorio${next.size ? '?' + next.toString() : ''}`
  }
  const from = { from: location.pathname + location.search }
  return <><PageHead title="Directorio" description="Empresas y personas de contacto, conectadas con toda su gestión comercial.">
    <button className="primary" onClick={onCreate}><Icon name="plus" /> Registrar prospecto</button></PageHead>
    <nav className="directory-tabs" aria-label="Vistas del directorio">
      <Link to={viewUrl(false)} aria-current={!contactsView ? 'page' : undefined}><Icon name="company" />Empresas <span>{data.companies.length}</span></Link>
      <Link to={viewUrl(true)} aria-current={contactsView ? 'page' : undefined}><Icon name="users" />Contactos <span>{data.contacts.length}</span></Link>
    </nav>
    <Filters preserve={['vista']} />
    {companyId && <div className="info-strip"><Icon name="company" /><span>Registros de {companyById.get(companyId)?.name ?? 'la empresa seleccionada'}.</span></div>}
    <section className="panel table-wrap" aria-label={contactsView ? 'Lista de contactos' : 'Lista de empresas'}>{contactsView ?
      <table><thead><tr><th>Persona de contacto</th><th>Empresa</th><th>Correo</th><th>Teléfono</th><th>Asesores de la empresa</th></tr></thead><tbody>{people.map(person => {
        const company = companyById.get(person.companyId)!
        return <tr key={person.id}><td><strong>{person.name}</strong></td><td><Link className="record-button" state={from} to={`/directorio/empresas/${company.id}`}>{company.name}</Link><small>{company.ruc || 'RUC por completar'}</small></td>
          <td>{person.email || 'Sin correo'}</td><td>{person.phone || 'Sin teléfono'}</td><td>{owners(company.id).join(', ') || 'Sin asignar'}</td></tr>
      })}</tbody></table> :
      <table><thead><tr><th>Empresa / RUC</th><th>Contactos</th><th>Negocios abiertos</th><th>Asesores</th><th>Valor abierto</th></tr></thead><tbody>{rows.map(company => {
        const contacts = data.contacts.filter(p => p.companyId === company.id), deals = data.deals.filter(d => d.companyId === company.id && openDeal(d))
        return <tr key={company.id}><td><Link className="record-button" state={from} to={`/directorio/empresas/${company.id}`}>{company.name}</Link><small>{company.ruc || 'RUC por completar'} · {originLabel(company.origin)}</small></td>
          <td><strong>{contacts[0]?.name || 'Sin contactos registrados'}</strong>{contacts[0]?.email && <small>{contacts[0].email}</small>}<Link className="text-link" to={`/directorio?vista=contactos&empresa=${company.id}`}>{contacts.length} {contacts.length === 1 ? 'contacto' : 'contactos'}<Icon name="arrow" size={14} /></Link></td>
          <td>{deals.length ? <Badge tone="blue">{deals.length} {deals.length === 1 ? 'negocio abierto' : 'negocios abiertos'}</Badge> : <Badge>Sin negocios abiertos</Badge>}</td>
          <td>{owners(company.id).join(', ') || 'Sin asignar'}</td><td><strong>{money(deals.reduce((sum, d) => sum + d.amount, 0))}</strong></td></tr>
      })}</tbody></table>}
      {!(contactsView ? people.length : rows.length) && <Empty>{contactsView ? 'No hay personas que coincidan con esos filtros.' : 'No hay empresas que coincidan con esos filtros.'}</Empty>}
      <div className="table-foot">{contactsView ? `${people.length} ${people.length === 1 ? 'contacto' : 'contactos'}` : `${rows.length} ${rows.length === 1 ? 'empresa' : 'empresas'}`} · Abre una empresa para consultar sus contactos, negocios y cotizaciones.</div>
    </section></>
}
