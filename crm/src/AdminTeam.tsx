import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Icon, PageHead } from './components'
import { api } from './api'
import { crmPath } from './paths'

interface Miembro {
  usuarioId: string
  nombre: string
  correo: string
  rol: 'admin' | 'commercial'
  activo: boolean
}

export default function AdminTeam() {
  const [members, setMembers] = useState<Miembro[]>([])
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<'admin' | 'commercial'>('commercial')
  const [claveDe, setClaveDe] = useState('')
  const [nuevaClave, setNuevaClave] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const cargar = () => api<{ members: Miembro[] }>('team').then(r => { setMembers(r.members); setError('') })

  useEffect(() => { cargar().catch(e => setError((e as Error).message)) }, [])

  async function agregar(event: FormEvent) {
    event.preventDefault()
    setBusy('alta'); setError('')
    try {
      const r = await api<{ members: Miembro[] }>('team', { email: email.trim(), nombre: nombre.trim(), password, rol })
      setMembers(r.members); setEmail(''); setNombre(''); setPassword('')
    } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }

  async function guardar(miembro: Miembro, cambio: Partial<Pick<Miembro, 'rol' | 'activo'>>) {
    setBusy(miembro.usuarioId); setError('')
    try {
      const r = await api<{ members: Miembro[] }>('team/acceso', {
        usuarioId: miembro.usuarioId, rol: cambio.rol ?? miembro.rol, activo: cambio.activo ?? miembro.activo,
      })
      setMembers(r.members)
    } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }

  return <><Link className="association-link" to={crmPath('/admin')}><Icon name="arrow" size={14} />Volver al panel</Link>
    <PageHead eyebrow="ADMINISTRACIÓN" title="Equipo" description="Crea comerciales con correo y contraseña, o agrega una cuenta que ya existe. Pueden entrar enseguida en el CRM." />
    {error && <p className="error" role="alert">{error}</p>}
    <form className="panel filters" onSubmit={agregar}>
      <label className="search-field">Nombre<input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ana Pérez" aria-label="Nombre del nuevo miembro" maxLength={100} /></label>
      <label className="search-field">Correo<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="ana@empresa.pe" aria-label="Correo del nuevo miembro" /></label>
      <label className="search-field">Contraseña<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Si la cuenta es nueva" aria-label="Contraseña del nuevo miembro" autoComplete="new-password" maxLength={72} /></label>
      <select aria-label="Rol del nuevo miembro" value={rol} onChange={e => setRol(e.target.value as 'admin' | 'commercial')}>
        <option value="commercial">Comercial</option><option value="admin">Administración</option>
      </select>
      <button className="primary" type="submit" disabled={busy === 'alta'}>{busy === 'alta' ? 'Agregando…' : 'Agregar'}</button>
    </form>
    <p className="hint">Si la lista no carga, ejecuta crm/backend/migrations/011_equipo.sql en el SQL Editor de Supabase.</p>
    <section className="panel table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Acceso</th></tr></thead><tbody>
      {members.map(m => <tr key={m.usuarioId}>
        <td><strong>{m.nombre}</strong></td>
        <td>{m.correo || 'Sin correo'}</td>
        <td><select aria-label={`Rol de ${m.nombre}`} value={m.rol} disabled={busy === m.usuarioId} onChange={e => guardar(m, { rol: e.target.value as Miembro['rol'] })}>
          <option value="commercial">Comercial</option><option value="admin">Administración</option>
        </select></td>
        <td><Badge tone={m.activo ? 'green' : ''}>{m.activo ? 'Activo' : 'Revocado'}</Badge>{' '}
          <button type="button" disabled={busy === m.usuarioId} onClick={() => guardar(m, { activo: !m.activo })}>{m.activo ? 'Revocar' : 'Reactivar'}</button>{' '}
          <button type="button" onClick={() => { setClaveDe(claveDe === m.usuarioId ? '' : m.usuarioId); setNuevaClave('') }}>Nueva clave</button>
          {claveDe === m.usuarioId && <form className="inline-form" onSubmit={async event => {
            event.preventDefault(); setBusy(m.usuarioId); setError('')
            try {
              await api('team/clave', { usuarioId: m.usuarioId, password: nuevaClave })
              setClaveDe(''); setNuevaClave('')
            } catch (e) { setError((e as Error).message) } finally { setBusy('') }
          }}><input type="password" required minLength={8} maxLength={72} aria-label={`Nueva clave de ${m.nombre}`} value={nuevaClave} onChange={e => setNuevaClave(e.target.value)} autoComplete="new-password" /><button type="submit" disabled={busy === m.usuarioId}>Guardar clave</button></form>}</td>
      </tr>)}
    </tbody></table>{!members.length && <p className="hint">Todavía no hay miembros en este espacio.</p>}</section></>
}
