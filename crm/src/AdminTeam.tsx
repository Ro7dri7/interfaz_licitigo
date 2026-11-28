import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Empty, Icon, PageHead } from './components'
import { initials } from './types'
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

  return <><Link className="association-link" to={crmPath('/admin')}><Icon name="back" size={14} />Volver al panel</Link>
    <PageHead eyebrow="ADMINISTRACIÓN" title="Equipo" description="Crea comerciales con correo y contraseña, o agrega una cuenta que ya existe. Pueden entrar enseguida en el CRM." />
    {error && <p className="error" role="alert">{error}</p>}
    <form className="panel team-form" onSubmit={agregar} aria-labelledby="team-form-title">
      <div className="section-head"><div><h2 id="team-form-title">Agregar miembro</h2><p>Si la cuenta ya existe, basta con el correo: se conserva su contraseña.</p></div></div>
      <div className="team-form-body">
        <label>Nombre<input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ana Pérez" maxLength={100} autoComplete="name" /></label>
        <label>Correo *<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="ana@empresa.pe" autoComplete="email" /></label>
        <label>Contraseña<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Solo si la cuenta es nueva" autoComplete="new-password" minLength={8} maxLength={72} /></label>
        <label>Rol<select value={rol} onChange={e => setRol(e.target.value as 'admin' | 'commercial')}>
          <option value="commercial">Comercial</option><option value="admin">Administración</option>
        </select></label>
        <button className="primary" type="submit" disabled={busy === 'alta'}><Icon name="plus" size={16} />{busy === 'alta' ? 'Agregando…' : 'Agregar'}</button>
      </div>
    </form>
    <p className="hint">Si la lista no carga, ejecuta crm/backend/migrations/011_equipo.sql en el SQL Editor de Supabase.</p>
    <section className="panel table-wrap" aria-label="Miembros del equipo"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Acceso</th></tr></thead><tbody>
      {members.map(m => <tr key={m.usuarioId}>
        <td><span className="person-cell"><span className="avatar small">{initials(m.nombre || m.correo)}</span><strong>{m.nombre || 'Sin nombre'}</strong></span></td>
        <td>{m.correo || 'Sin correo'}</td>
        <td><select className="compact-select" aria-label={`Rol de ${m.nombre}`} value={m.rol} disabled={busy === m.usuarioId} onChange={e => guardar(m, { rol: e.target.value as Miembro['rol'] })}>
          <option value="commercial">Comercial</option><option value="admin">Administración</option>
        </select></td>
        <td><div className="row-buttons"><Badge tone={m.activo ? 'green' : 'red'}>{m.activo ? 'Activo' : 'Revocado'}</Badge>
          <button type="button" disabled={busy === m.usuarioId} onClick={() => guardar(m, { activo: !m.activo })}>{m.activo ? 'Revocar' : 'Reactivar'}</button>
          <button type="button" aria-expanded={claveDe === m.usuarioId} onClick={() => { setClaveDe(claveDe === m.usuarioId ? '' : m.usuarioId); setNuevaClave('') }}>Nueva clave</button></div>
          {claveDe === m.usuarioId && <form className="inline-form" onSubmit={async event => {
            event.preventDefault(); setBusy(m.usuarioId); setError('')
            try {
              await api('team/clave', { usuarioId: m.usuarioId, password: nuevaClave })
              setClaveDe(''); setNuevaClave('')
            } catch (e) { setError((e as Error).message) } finally { setBusy('') }
          }}><input type="password" required minLength={8} maxLength={72} aria-label={`Nueva clave de ${m.nombre}`} placeholder="Mínimo 8 caracteres" value={nuevaClave} onChange={e => setNuevaClave(e.target.value)} autoComplete="new-password" /><button type="submit" className="primary" disabled={busy === m.usuarioId}>Guardar clave</button></form>}</td>
      </tr>)}
    </tbody></table>{!members.length && <Empty title="Todavía no hay miembros">Agrega el primero con el formulario de arriba.</Empty>}</section></>
}
