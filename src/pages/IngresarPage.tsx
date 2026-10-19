import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import * as api from '../lib/api'
import { mensajeError } from '../lib/api'
import { logout, obtenerSesion, olvidarCierre } from '../lib/auth'
import { btnPrimary, btnSecondary, card, container, dot, pillNeutral } from '../lib/ui'
import type { Perfil } from '../types/models'

type Modo = 'login' | 'registro'

const label = 'mt-3 mb-1.5 text-[13px] font-semibold'
const input =
  'w-full rounded-sm border border-line-strong bg-white px-3 py-[11px] text-[14px] focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-soft)] focus:outline-none'
const errorBox = 'mt-3.5 rounded-sm bg-danger-soft px-3 py-2.5 text-[13.5px] text-danger'
const tab = (activo: boolean) =>
  `rounded-[9px] border-none px-2.5 py-[9px] text-[13.5px] font-semibold ${
    activo ? 'bg-white text-ink shadow-card' : 'bg-transparent text-muted'
  }`
const link = 'border-none bg-transparent p-0 font-semibold text-primary'

export function IngresarPage() {
  const navigate = useNavigate()
  // Query params: ?modo=registro&email=...&volver=/app/descubrimiento
  const [params] = useSearchParams()
  const volver = params.get('volver')

  const [modo, setModo] = useState<Modo>(params.get('modo') === 'registro' ? 'registro' : 'login')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Sesión que ya estaba guardada al abrir la página (no la que se crea al iniciar sesión aquí). */
  const [sesionPrevia, setSesionPrevia] = useState(() => obtenerSesion()?.usuario ?? null)

  useEffect(() => olvidarCierre(), [])

  /** Con RUC y keywords va directo a Descubrimiento; si no, completa el onboarding. */
  const irSegunPerfil = (p: Perfil) => {
    setEnviando(false)
    if (!p.ruc || !p.keywords.length) {
      navigate('/onboarding')
    } else if (volver && volver.startsWith('/') && !volver.startsWith('//')) {
      navigate(volver)
    } else {
      navigate('/app/descubrimiento')
    }
  }

  /** Hay una sesión guardada en este navegador: se pregunta antes de usarla. */
  const continuarConSesion = () => {
    if (enviando) return
    setEnviando(true)
    setError(null)
    api
      .perfil()
      .then(irSegunPerfil)
      .catch((err) => {
        setEnviando(false)
        logout(false)
        setSesionPrevia(null)
        setError(mensajeError(err, 'Tu sesión anterior ya no es válida. Vuelve a iniciar sesión.'))
      })
  }

  const usarOtraCuenta = () => {
    logout(false)
    setSesionPrevia(null)
    setEmail('')
    setPassword('')
    setError(null)
  }

  const cambiarModo = (m: Modo) => {
    setModo(m)
    setError(null)
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (enviando) return
    const correo = email.trim()
    const nom = nombre.trim()

    if (modo === 'registro' && nom.length < 2) return setError('Escribe tu nombre.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return setError('Ingresa un correo válido.')
    if (modo === 'registro' && password.length < 8) {
      return setError('La contraseña debe tener al menos 8 caracteres.')
    }
    if (!password) return setError('Ingresa tu contraseña.')

    setEnviando(true)
    setError(null)
    const peticion = modo === 'registro' ? api.registro(nom, correo, password) : api.login(correo, password)
    peticion
      .then(() => api.perfil())
      .then(irSegunPerfil)
      .catch((err) => {
        setEnviando(false)
        setError(mensajeError(err, 'No pudimos continuar. Inténtalo de nuevo.'))
      })
  }

  const cardClass = `${card} flex w-full max-w-[420px] flex-col p-7 [&_h1]:mt-[22px] [&_h1]:text-[26px]`

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className={`${container} flex items-center justify-between py-5`}>
        <Link to="/" className="font-serif text-[26px] font-semibold">
          LiciHub<span className="text-primary">.</span>
        </Link>
        <span className={pillNeutral}>
          <span className={dot} style={{ background: 'var(--color-success)' }} />
          Perú • SEACE
        </span>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16">
        {sesionPrevia ? (
          <div className={cardClass}>
            <h1>Ya tienes una sesión abierta</h1>
            <p className="mt-2 mb-[18px] text-[14px] leading-normal text-muted">
              En este navegador entraste como <strong>{sesionPrevia.nombre || sesionPrevia.email}</strong>
              {sesionPrevia.nombre ? <span className="text-faint"> ({sesionPrevia.email})</span> : null}
            </p>
            {error ? (
              <p className={errorBox} role="alert">
                {error}
              </p>
            ) : null}
            <button className={`${btnPrimary} mt-[18px] w-full`} type="button" disabled={enviando} onClick={continuarConSesion}>
              {enviando ? 'Un momento…' : 'Continuar como ' + (sesionPrevia.nombre || sesionPrevia.email)}
            </button>
            <button className={`${btnSecondary} mt-2.5 w-full`} type="button" disabled={enviando} onClick={usarOtraCuenta}>
              Entrar con otra cuenta
            </button>
          </div>
        ) : (
          <form className={cardClass} onSubmit={enviar} noValidate>
            <div className="grid grid-cols-[1fr_1fr] rounded-md bg-canvas p-1" role="tablist">
              <button
                type="button"
                role="tab"
                className={tab(modo === 'login')}
                aria-selected={modo === 'login'}
                onClick={() => cambiarModo('login')}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                role="tab"
                className={tab(modo === 'registro')}
                aria-selected={modo === 'registro'}
                onClick={() => cambiarModo('registro')}
              >
                Crear cuenta
              </button>
            </div>

            <h1>{modo === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta gratis'}</h1>
            <p className="mt-2 mb-[18px] text-[14px] leading-normal text-muted">
              {modo === 'login' ? (
                'Entra para ver las licitaciones abiertas que encajan con tu empresa.'
              ) : (
                <>
                  Incluye <strong>5 desbloqueos</strong> de licitaciones con bases y análisis ISO con IA.
                </>
              )}
            </p>

            {modo === 'registro' ? (
              <>
                <label className={label} htmlFor="nombre">
                  Nombre
                </label>
                <input
                  id="nombre"
                  className={input}
                  type="text"
                  autoComplete="name"
                  maxLength={120}
                  name="nombre"
                  placeholder="Ana Pérez"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
              </>
            ) : null}

            <label className={label} htmlFor="email">
              Correo
            </label>
            <input
              id="email"
              className={input}
              type="email"
              autoComplete="email"
              maxLength={254}
              name="email"
              placeholder="ana@empresa.pe"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <label className={label} htmlFor="password">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="password"
                className={`${input} pr-[72px]`}
                type={verPassword ? 'text' : 'password'}
                maxLength={72}
                autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
                name="password"
                placeholder={modo === 'registro' ? 'Mínimo 8 caracteres' : ''}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute top-1/2 right-1.5 -translate-y-1/2 border-none bg-transparent px-2 py-1.5 text-[12.5px] font-semibold text-primary"
                onClick={() => setVerPassword(!verPassword)}
                aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {verPassword ? 'Ocultar' : 'Ver'}
              </button>
            </div>

            {error ? (
              <p className={errorBox} role="alert">
                {error}
              </p>
            ) : null}

            <button className={`${btnPrimary} mt-[18px] w-full`} type="submit" disabled={enviando}>
              {enviando ? 'Un momento…' : modo === 'login' ? 'Entrar' : 'Crear cuenta y continuar'}
            </button>

            <p className="mt-4 text-center text-[13.5px] text-muted">
              {modo === 'login' ? (
                <>
                  ¿No tienes cuenta?{' '}
                  <button type="button" className={link} onClick={() => cambiarModo('registro')}>
                    Créala aquí
                  </button>
                </>
              ) : (
                <>
                  ¿Ya tienes cuenta?{' '}
                  <button type="button" className={link} onClick={() => cambiarModo('login')}>
                    Inicia sesión
                  </button>
                </>
              )}
            </p>
          </form>
        )}
      </main>
    </div>
  )
}
