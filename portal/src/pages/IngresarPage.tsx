import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import * as api from '../lib/api'
import { mensajeError } from '../lib/api'
import { logout, obtenerSesion, olvidarCierre, refrescar } from '../lib/auth'
import type { Sesion } from '../types/models'
import { ClaveChecklist, claveValida } from '../components/ClaveChecklist'
import { btnPrimary, btnSecondary, card, container, dot, pillNeutral } from '../lib/ui'
import type { Perfil } from '../types/models'

type Modo = 'login' | 'registro' | 'codigo' | 'recuperar'

const label = 'mt-3 mb-1.5 text-[13px] font-semibold'
const input =
  'w-full rounded-sm border border-line-strong bg-white px-3 py-[11px] text-[14px] focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-soft)] focus:outline-none'
const errorBox = 'mt-3.5 rounded-sm bg-danger-soft px-3 py-2.5 text-[13.5px] text-danger'
const tab = (activo: boolean) =>
  `rounded-[9px] border-none px-2.5 py-[9px] text-[13.5px] font-semibold ${
    activo ? 'bg-white text-ink shadow-card' : 'bg-transparent text-muted'
  }`
const link = 'border-none bg-transparent p-0 font-semibold text-primary'

const PLANES_PAGO = new Set(['explorador', 'comercial', 'empresarial'])

const ERRORES_GOOGLE: Record<string, string> = {
  google: 'No pudimos completar el ingreso con Google. Si cancelaste el permiso, vuelve a intentarlo.',
  google_config: 'Google todavía no está disponible. Puedes registrarte con tu correo mientras lo activamos.',
  google_equipo: 'Esta entrada con Google es solo para clientes. Si eres del equipo comercial, entra con tu correo.',
}

function enlaceGoogle(volver: string | null, plan: string | null): string {
  const consulta = new URLSearchParams()
  if (volver && !volver.startsWith('/comercial')) consulta.set('volver', volver)
  if (plan && PLANES_PAGO.has(plan)) consulta.set('plan', plan)
  const texto = consulta.toString()
  return texto ? `/api/auth/google?${texto}` : '/api/auth/google'
}

/** Solo rutas internas. Rechaza protocolos, barras invertidas y dobles barras. */
function rutaInterna(valor: string | null): string | null {
  if (!valor || valor.length > 200 || !valor.startsWith('/') || valor.startsWith('//')) return null
  if (valor.includes('\\') || valor.includes('://') || /[\r\n\0]/.test(valor)) return null
  return valor
}

export function IngresarPage() {
  const navigate = useNavigate()
  // Query params: ?modo=registro&email=...&volver=/app/descubrimiento
  const [params] = useSearchParams()
  const volverPedido = rutaInterna(params.get('volver'))
  const volver = volverPedido?.startsWith('/comercial') ? null : volverPedido

  const [modo, setModo] = useState<Modo>(params.get('modo') === 'registro' ? 'registro' : 'login')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [acepta, setAcepta] = useState(false)
  const googleListo = acepta && telefono.replace(/\D/g, '').length >= 8
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [codigoEnviado, setCodigoEnviado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(ERRORES_GOOGLE[params.get('error') || ''] ?? null)
  /** Sesión que ya estaba guardada al abrir la página (no la que se crea al iniciar sesión aquí). */
  const [sesionPrevia, setSesionPrevia] = useState(() => {
    const previa = obtenerSesion()
    if (previa?.rol === 'admin' || previa?.rol === 'commercial') return null
    return previa?.usuario ?? null
  })

  useEffect(() => {
    olvidarCierre()
    const previa = obtenerSesion()
    if (previa?.rol === 'admin' || previa?.rol === 'commercial') {
      logout(false)
      setSesionPrevia(null)
    }
    if (volverPedido?.startsWith('/comercial')) {
      const limpia = new URLSearchParams(params)
      limpia.delete('volver')
      const search = limpia.toString()
      navigate({ pathname: '/ingresar', search: search ? `?${search}` : '' }, { replace: true })
    }
    // Solo al abrir el login: no reanudar una sesión comercial ni conservar volver=/comercial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const plan = params.get('plan')
    if (plan && PLANES_PAGO.has(plan)) sessionStorage.setItem('lici.plan', plan)
  }, [params])

  useEffect(() => {
    const ticket = params.get('ticket')
    if (!ticket) return
    let activo = true
    setEnviando(true)
    api
      .canjearTicket(ticket)
      .then(() => api.perfil())
      .then((p) => {
        if (activo) irSegunPerfil(p)
      })
      .catch((err) => {
        if (!activo) return
        setEnviando(false)
        setError(mensajeError(err, 'No pudimos completar el ingreso con Google.'))
      })
    return () => {
      activo = false
    }
    // El ticket se canjea una sola vez al abrir el retorno de Google.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  /** Admin y comercial van al CRM. El cliente sigue a onboarding o a Descubrimiento. */
  const irSegunPerfil = (p: Perfil) => {
    setEnviando(false)
    const rol = (obtenerSesion() as Sesion | null)?.rol
    if (rol === 'admin') {
      navigate('/comercial/admin')
      return
    }
    if (rol === 'commercial') {
      navigate('/comercial')
      return
    }
    const plan = params.get('plan') || sessionStorage.getItem('lici.plan')
    const planValido = plan && PLANES_PAGO.has(plan) ? plan : null
    if (!p.ruc) {
      if (planValido) sessionStorage.setItem('lici.plan', planValido)
      navigate('/onboarding')
      return
    }
    if (planValido) {
      sessionStorage.removeItem('lici.plan')
      api
        .checkout(planValido)
        .then(({ checkout_url }) => {
          window.location.assign(checkout_url)
        })
        .catch(() => navigate('/app/descubrimiento'))
      return
    }
    if (!p.keywords.length) {
      navigate('/onboarding')
    } else if (volver && volver.startsWith('/') && !volver.startsWith('//') && !volver.startsWith('/comercial')) {
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
    refrescar()
      .then(() => api.perfil())
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
    setAviso(null)
    setCodigo('')
    setCodigoEnviado(false)
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (enviando) return
    const correo = email.trim()
    const nom = nombre.trim()

    if (modo === 'registro' && nom.length < 2) return setError('Escribe tu nombre.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return setError('Ingresa un correo válido.')
    if (modo === 'recuperar') {
      setEnviando(true)
      setError(null)
      api
        .recuperarContrasena(correo)
        .then((r) => {
          setEnviando(false)
          setAviso(r.mensaje)
        })
        .catch((err) => {
          setEnviando(false)
          setError(mensajeError(err, 'No pudimos enviar el correo. Inténtalo de nuevo.'))
        })
      return
    }
    if (modo === 'codigo') {
      if (!codigoEnviado) {
        setEnviando(true)
        setError(null)
        api
          .enviarCodigo(correo)
          .then((r) => {
            setEnviando(false)
            setCodigoEnviado(true)
            setAviso(r.mensaje)
          })
          .catch((err) => {
            setEnviando(false)
            setError(mensajeError(err, 'No pudimos enviar el código.'))
          })
        return
      }
      if (!/^\d{6,10}$/.test(codigo.trim())) return setError('Ingresa el código que te enviamos.')
      setEnviando(true)
      setError(null)
      api
        .verificarCodigo(correo, codigo.trim())
        .then(() => api.perfil())
        .then(irSegunPerfil)
        .catch((err) => {
          setEnviando(false)
          setError(mensajeError(err, 'No pudimos verificar el código.'))
        })
      return
    }
    if (modo === 'registro' && !claveValida(password)) {
      return setError('La contraseña todavía no cumple las 5 reglas.')
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
            {modo === 'login' || modo === 'registro' ? (
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
            ) : null}

            <h1>
              {modo === 'registro'
                ? 'Crea tu cuenta gratis'
                : modo === 'recuperar'
                  ? 'Restablece tu contraseña'
                  : modo === 'codigo'
                    ? 'Entra con un código'
                    : 'Bienvenido de nuevo'}
            </h1>
            <p className="mt-2 mb-[18px] text-[14px] leading-normal text-muted">
              {modo === 'login' ? (
                'Clientes, equipo comercial y administración entran por aquí.'
              ) : modo === 'recuperar' ? (
                'Te enviamos un enlace si el correo está registrado.'
              ) : modo === 'codigo' ? (
                'Te enviamos un código de un solo uso. No crea acceso al CRM.'
              ) : (
                <>
                  Incluye <strong>5 desbloqueos</strong> de licitaciones con bases y análisis ISO con IA.
                </>
              )}
            </p>
            {modo === 'registro' ? (
              <div className="mb-3 flex flex-col gap-2">
                <label className={label} htmlFor="telefono-google">Teléfono</label>
                <input id="telefono-google" className={input} type="tel" autoComplete="tel" placeholder="+51 999 999 999" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                <label className="flex items-start gap-2 text-[13px] text-muted">
                  <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
                  <span>Acepto los términos y condiciones para crear mi cuenta.</span>
                </label>
              </div>
            ) : null}
            {modo === 'login' || modo === 'registro' ? (
              <a className={`${btnSecondary} mb-3 w-full ${modo === 'registro' && !googleListo ? 'pointer-events-none opacity-50' : ''}`} href={modo === 'registro' && !googleListo ? undefined : enlaceGoogle(volver, params.get('plan'))} aria-disabled={modo === 'registro' && !googleListo} onClick={(e) => { if (modo === 'registro' && !googleListo) { e.preventDefault(); return } if (modo === 'registro') sessionStorage.setItem('lici.telefono', telefono.trim()) }}>
                <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3h3.86c2.26-2.09 3.685-5.17 3.685-9.09z" fill="#4285F4" />
                  <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.26v3.09C3.25 21.3 7.31 24 12 24z" fill="#34A853" />
                  <path d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.26C.46 8.23 0 10.06 0 12s.46 3.77 1.26 5.38l4.01-3.09z" fill="#FBBC05" />
                  <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.26 6.62l4.01 3.09c.95-2.85 3.6-4.96 6.73-4.96z" fill="#EA4335" />
                </svg>
                {modo === 'registro' ? 'Crear cuenta con Google' : 'Continuar con Google'}
              </a>
            ) : null}

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

            {modo === 'login' || modo === 'registro' ? (
              <>
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
                    placeholder={modo === 'registro' ? 'Mayúscula, número y símbolo' : ''}
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
                {modo === 'registro' ? <ClaveChecklist valor={password} /> : null}
              </>
            ) : null}
            {modo === 'codigo' && codigoEnviado ? (
              <>
                <label className={label} htmlFor="codigo">
                  Código
                </label>
                <input
                  id="codigo"
                  className={input}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={12}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                />
              </>
            ) : null}

            {aviso ? (
              <p className="mt-3.5 text-[13.5px] text-muted" role="status">
                {aviso}
              </p>
            ) : null}
            {error ? (
              <p className={errorBox} role="alert">
                {error}
              </p>
            ) : null}

            <button className={`${btnPrimary} mt-[18px] w-full`} type="submit" disabled={enviando || (modo === 'registro' && !claveValida(password))}>
              {enviando
                ? 'Un momento…'
                : modo === 'registro'
                  ? 'Crear cuenta y continuar'
                  : modo === 'recuperar'
                    ? 'Enviar enlace'
                    : modo === 'codigo'
                      ? codigoEnviado
                        ? 'Verificar código'
                        : 'Enviar código'
                      : 'Entrar'}
            </button>

            <p className="mt-4 text-center text-[13.5px] text-muted">
              {modo === 'login' ? (
                <>
                  <button type="button" className={link} onClick={() => cambiarModo('codigo')}>
                    Entrar con un código
                  </button>
                  {' · '}
                  <button type="button" className={link} onClick={() => cambiarModo('recuperar')}>
                    He olvidado mi contraseña
                  </button>
                  <br />
                  ¿No tienes cuenta?{' '}
                  <button type="button" className={link} onClick={() => cambiarModo('registro')}>
                    Créala aquí
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className={link} onClick={() => cambiarModo('login')}>
                    Volver al inicio de sesión
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
