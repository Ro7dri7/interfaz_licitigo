import { useState } from 'react'
import { useCRM } from './crm-context'

export function OwnerPicker({ companyId, actual }: { companyId: string; actual: string }) {
  const { session, command } = useCRM()
  const [busca, setBusca] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState('')
  if (session.user.role !== 'admin') return <span>{actual || 'Sin asignar'}</span>
  const gente = [...new Set(session.advisors ?? [])].filter(nombre => nombre.toLocaleLowerCase().includes(busca.trim().toLocaleLowerCase()))
  return <div className="owner-picker">
    <input aria-label={`Buscar comercial para asignar. Actual: ${actual || 'sin asignar'}`} placeholder={actual || 'Buscar comercial'} value={busca} autoComplete="off" onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)} onChange={e => { setBusca(e.target.value); setAbierto(true) }} />
    {abierto && <ul role="listbox">
      {gente.map(nombre => <li key={nombre}><button type="button" onMouseDown={e => e.preventDefault()} onClick={async () => {
        setError('')
        try { await command('assign_company_owner', { companyId, owner: nombre }); setBusca(''); setAbierto(false) }
        catch (err) { setError((err as Error).message) }
      }}>{nombre}</button></li>)}
      {!gente.length && <li className="hint">No hay comerciales que coincidan.</li>}
    </ul>}
    {error && <small className="error">{error}</small>}
  </div>
}
