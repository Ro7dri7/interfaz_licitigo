import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../lib/api'
import { mensajeError } from '../lib/api'
import { ClaveChecklist, claveValida } from '../components/ClaveChecklist'
import { btnPrimary, card, container } from '../lib/ui'

const input =
  'w-full rounded-sm border border-line-strong bg-white px-3 py-[11px] text-[14px] focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-soft)] focus:outline-none'
const errorBox = 'mt-3.5 rounded-sm bg-danger-soft px-3 py-2.5 text-[13.5px] text-danger'

function tokenDeEnlace(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const tipo = params.get('type')
  const token = params.get('access_token')
  if (!token || (tipo && tipo !== 'recovery')) return null
  return token
}

export function RestablecerPage() {
  const [token] = useState(tokenDeEnlace)
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)
  const [error, setError] = useState<string | null>(token ? null : 'Este enlace no es válido o ya venció. Pide uno nuevo.')

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (!token || enviando) return
    if (!claveValida(password)) return setError('La contraseña todavía no cumple las 5 reglas.')
    setEnviando(true)
    setError(null)
    api
      .restablecerContrasena(token, password)
      .then(() => {
        window.history.replaceState(null, '', '/ingresar/restablecer')
        setListo(true)
      })
      .catch((err) => {
        setEnviando(false)
        setError(mensajeError(err, 'No pudimos cambiar la contraseña.'))
      })
  }

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className={`${container} py-5`}>
        <Link to="/" className="text-[18px] font-bold text-ink">
          LiciHub
        </Link>
      </header>
      <main id="main-content" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 pt-6 pb-16">
        <form className={`${card} flex w-full max-w-[420px] flex-col p-7`} onSubmit={enviar}>
          <h1 className="text-[26px]">Nueva contraseña</h1>
          <p className="mt-2 mb-[18px] text-[14px] text-muted">
            {listo ? 'Ya puedes entrar con tu nueva contraseña.' : 'Elige una contraseña que cumpla las 5 reglas.'}
          </p>
          {listo ? null : (
            <input
              className={input}
              type="password"
              autoComplete="new-password"
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Nueva contraseña"
            />
          )}
          {listo ? null : <ClaveChecklist valor={password} />}
          {error ? (
            <p className={errorBox} role="alert">
              {error}
            </p>
          ) : null}
          {listo ? (
            <Link className={`${btnPrimary} mt-[18px] w-full`} to="/ingresar">
              Ir a iniciar sesión
            </Link>
          ) : (
            <button className={`${btnPrimary} mt-[18px] w-full`} type="submit" disabled={enviando || !token || !claveValida(password)}>
              {enviando ? 'Un momento…' : 'Guardar contraseña'}
            </button>
          )}
        </form>
      </main>
    </div>
  )
}
