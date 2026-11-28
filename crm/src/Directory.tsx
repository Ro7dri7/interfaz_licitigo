import { useDeferredValue } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { Badge, Empty, Icon, PageHead } from './components'
import { Filters } from './Collections'
import { useCRM } from './crm-context'
import { OwnerPicker } from './OwnerPicker'
import { money, openDeal, originLabel } from './types'
import { crmPath } from './paths'
import { limaDay, ownerOptions } from './utils'

export default function Directory({ onCreate }: { onCreate: () => void }) {
  const { snapshot: { data }, session } = useCRM(), [params, setParams] = useSearchParams(), location = useLocation()
  // Antes del posible redireccionamiento: los hooks deben llamarse siempre en el mismo orden.
  const query = useDeferredValue((params.get('q') ?? '').toLocaleLowerCase())
  // Enlaces antiguos (?vista=contactos) ahora viven en la pantalla Contactos.
  if (params.get('vista') === 'contactos') {
    const next = new URLSearchParams(params); next.delete('vista')
    return <Navigate replace to={crmPath(`/contactos${next.size ? '?' + next.toString() : ''}`)} />
  }
  const setParam = (key: string, value: string) => setParams(p => { if (value) p.set(key, value); else p.delete(key); return p }, { replace: true })
  const companyId = params.get('empresa')
  const responsable = params.get('responsable') ?? '', from = params.get('desde'), to = params.get('hasta')
  const owners = (id: string) => [...new Set([
    ...data.deals.filter(d => d.companyId === id).map(d => d.owner),
    ...data.prospects.filter(p => p.companyId === id).map(p => p.owner),
  ])].filter(owner => owner !== 'Sin asignar')
  const comerciales = ownerOptions(session.advisors, [...data.deals, ...data.prospects], responsable)
  const companies = data.companies.filter(c => {
    if (companyId && c.id !== companyId) return false
    if (params.get('origen') && c.origin !== params.get('origen')) return false
    if (from && limaDay(c.createdAt) < from) return false
    if (to && limaDay(c.createdAt) > to) return false
    if (responsable) {
      const asignados = owners(c.id)
      if (!asignados.includes(responsable)) return false
    }
    return true
  })
  const companyById = new Map(companies.map(company => [company.id, company]))
  const rows = companies.filter(c => `${c.name} ${c.ruc} ${data.contacts.filter(p => p.companyId === c.id).map(p => `${p.name} ${p.email}`).join(' ')}`.toLocaleLowerCase().includes(query))
  const back = { from: location.pathname + location.search }
  return <><PageHead title="Directorio" description="Empresas identificadas por su RUC, con sus contactos, negocios y cotizaciones.">
    <button className="primary" onClick={onCreate}><Icon name="plus" /> Nuevo negocio</button></PageHead>
    <Filters>
      <select aria-label="Filtrar por comercial" value={responsable} onChange={e => setParam('responsable', e.target.value)}>
        <option value="">Todo el equipo</option>
        {comerciales.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <label className="filter-date">Creada desde<input type="date" aria-label="Empresa creada desde" value={from ?? ''} onChange={e => setParam('desde', e.target.value)} /></label>
      <label className="filter-date">Creada hasta<input type="date" aria-label="Empresa creada hasta" value={to ?? ''} onChange={e => setParam('hasta', e.target.value)} /></label>
    </Filters>
    {companyId && <div className="info-strip"><Icon name="company" /><span>Registros de {companyById.get(companyId)?.name ?? 'la empresa seleccionada'}.</span></div>}
    <section className="panel table-wrap" aria-label="Lista de empresas">
      <table><thead><tr><th>Empresa / RUC</th><th>Contactos</th><th>Negocios abiertos</th><th>{session.user.role === 'admin' ? 'Comercial' : 'Asesores'}</th><th>Valor abierto</th></tr></thead><tbody>{rows.map(company => {
        const contacts = data.contacts.filter(p => p.companyId === company.id), deals = data.deals.filter(d => d.companyId === company.id && openDeal(d))
        const asignados = owners(company.id).join(', ')
        return <tr key={company.id}><td><Link className="record-button" state={back} to={crmPath(`/directorio/empresas/${company.id}`)}>{company.name}</Link><small>{company.ruc || 'RUC por completar'} · {originLabel(company.origin)}</small></td>
          <td><strong>{contacts[0]?.name || 'Sin contactos registrados'}</strong>{contacts[0]?.email && <small>{contacts[0].email}</small>}<Link className="text-link" to={crmPath(`/contactos?empresa=${company.id}`)}>{contacts.length} {contacts.length === 1 ? 'contacto' : 'contactos'}<Icon name="arrow" size={14} /></Link></td>
          <td>{deals.length ? <Badge tone="blue">{deals.length} {deals.length === 1 ? 'negocio abierto' : 'negocios abiertos'}</Badge> : <Badge>Sin negocios abiertos</Badge>}</td>
          <td><OwnerPicker companyId={company.id} actual={asignados} /></td><td><strong>{money(deals.reduce((sum, d) => sum + d.amount, 0))}</strong></td></tr>
      })}</tbody></table>
      {!rows.length && <Empty>No hay empresas que coincidan con esos filtros.</Empty>}
      <div className="table-foot">{rows.length} {rows.length === 1 ? 'empresa' : 'empresas'} · Abre una empresa para consultar sus contactos, negocios y cotizaciones.</div>
    </section></>
}
