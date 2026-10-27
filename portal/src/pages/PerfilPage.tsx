import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EnlaceTelegram } from '../components/EnlaceTelegram'
import { Topbar } from '../components/Topbar'
import * as api from '../lib/api'
import { mensajeError } from '../lib/api'
import { logout } from '../lib/auth'
import { soles } from '../lib/formato'
import {
  btnGhost,
  btnPrimary,
  btnSecondary,
  card,
  container,
  mono,
  pillDanger,
  pillNeutral,
  pillPrimary,
  pillSuccess,
  pillWarning,
} from '../lib/ui'
import type { ActividadCiiu, HistorialEmpresa, Perfil, TelegramEstado, TelegramLink } from '../types/models'

const MAX_KEYWORDS = 30

function fecha(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', year: 'numeric' })
}

// ----------------------------------------------------------------------------- estilos

const seccion = `${card} flex flex-col gap-3.5 p-[22px] max-[720px]:p-4`
const seccionHead = 'flex items-center justify-between gap-2.5'
const eyebrow = 'text-[11px] font-bold tracking-[0.05em] text-faint uppercase'
const muted = 'text-[13.5px] leading-normal text-muted'
const pequeno = 'text-[12.5px] leading-normal text-muted'
const aviso = 'rounded-sm bg-primary-soft px-3 py-2.5 text-[13px] text-muted'
const acciones = 'flex flex-wrap items-center gap-2.5'
const link = 'border-none bg-transparent p-0 text-left text-[13px] font-semibold text-primary'
const inputForm =
  'min-w-0 flex-1 rounded-sm border border-line-strong px-3 py-[9px] text-[13.5px] focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-soft)] focus:outline-none'
const vacio = 'flex flex-wrap items-center justify-center gap-3 py-[18px] text-[14px] text-muted'
const ciiuLi =
  'grid grid-cols-[56px_1fr_auto] items-center gap-3 border-b border-line py-2.5 text-[13.5px] last:border-b-0 max-[720px]:grid-cols-[48px_1fr]'
const ciiuTags = 'flex flex-wrap justify-end gap-1.5 max-[720px]:col-start-2 max-[720px]:justify-start'

function Ciiu({ c, children }: { c: ActividadCiiu; children: ReactNode }) {
  return (
    <li className={ciiuLi}>
      <span className={`${mono} font-bold text-primary`}>{c.codigo}</span>
      <span>{c.descripcion}</span>
      <span className={ciiuTags}>{children}</span>
    </li>
  )
}

export function PerfilPage() {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [historial, setHistorial] = useState<HistorialEmpresa | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // cuenta
  const [editandoNombre, setEditandoNombre] = useState(false)
  const [nombre, setNombre] = useState('')
  const [guardandoNombre, setGuardandoNombre] = useState(false)

  // empresa
  const [actualizandoEmpresa, setActualizandoEmpresa] = useState(false)
  const [avisoEmpresa, setAvisoEmpresa] = useState<string | null>(null)

  // telegram
  const [telegram, setTelegram] = useState<TelegramEstado | null>(null)
  const [enlaceTelegram, setEnlaceTelegram] = useState<TelegramLink | null>(null)
  const [procesandoTelegram, setProcesandoTelegram] = useState(false)
  const [avisoTelegram, setAvisoTelegram] = useState<string | null>(null)

  // keywords
  const [nuevaKeyword, setNuevaKeyword] = useState('')
  const [avisoKeyword, setAvisoKeyword] = useState<string | null>(null)
  const [guardandoKeywords, setGuardandoKeywords] = useState(false)

  const perfilRef = useRef(perfil)
  useEffect(() => {
    perfilRef.current = perfil
  }, [perfil])
  /** Vigencia del montaje actual: las respuestas de un montaje anterior (StrictMode, cierre) se descartan. */
  const montaje = useRef({ vigente: false })

  const empresa = perfil?.empresa ?? null
  const cupo = perfil?.desbloqueos ?? null
  const quota = cupo ? `${cupo.usados}/${cupo.limite}` : '—'
  const porcentajeCupo = cupo && cupo.limite ? Math.min(100, Math.round((cupo.usados / cupo.limite) * 100)) : 0
  const ciiusOficiales = (empresa?.ciius ?? []).filter((c) => c.origen === 'oficial')
  const ciiusInferidos = (empresa?.ciius ?? []).filter((c) => c.origen !== 'oficial')
  const tasaExito = historial && historial.procesos ? Math.round((historial.ganados / historial.procesos) * 100) : 0
  const objetosHistorial = Object.entries(historial?.porObjeto ?? {})

  const pedir = useCallback(() => {
    const m = montaje.current
    const vigente = () => m.vigente
    api
      .perfil()
      .then((p) => {
        if (!vigente()) return
        setLoading(false)
        setPerfil(p)
        setNombre(p.usuario.nombre)
        if (p.ruc) {
          api
            .historialEmpresa()
            .then((h) => vigente() && setHistorial(h))
            .catch(() => vigente() && setHistorial(null))
          api
            .estadoTelegram()
            .then((t) => vigente() && setTelegram(t))
            .catch(() => vigente() && setTelegram(null))
        }
      })
      .catch((err) => {
        if (!vigente()) return
        setLoading(false)
        setError(mensajeError(err, 'No pudimos cargar tu perfil.'))
      })
  }, [])

  const cargar = () => {
    setLoading(true)
    setError(null)
    pedir()
  }

  useEffect(() => {
    const m = { vigente: true }
    montaje.current = m
    pedir()
    return () => {
      m.vigente = false
    }
  }, [pedir])

  // ----------------------------------------------------------------------- telegram

  /** Genera un enlace de un solo uso; al pulsar Iniciar en el bot, ese chat queda ligado a la cuenta. */
  const conectarTelegram = () => {
    if (procesandoTelegram) return
    setProcesandoTelegram(true)
    setAvisoTelegram(null)
    api
      .suscribirTelegram()
      .then((l) => {
        setProcesandoTelegram(false)
        setEnlaceTelegram(l)
      })
      .catch((err) => {
        setProcesandoTelegram(false)
        setAvisoTelegram(mensajeError(err, 'No pudimos generar el enlace de Telegram.'))
      })
  }

  /** Vuelve a consultar si ya se pulsó Iniciar en el bot. */
  const verificarTelegram = () => {
    api
      .estadoTelegram()
      .then((t) => {
        setTelegram(t)
        if (t.vinculado) setEnlaceTelegram(null)
        else setAvisoTelegram('Aún no se conecta. Abre el enlace y pulsa Iniciar en el bot.')
      })
      .catch((err) => setAvisoTelegram(mensajeError(err, 'No pudimos consultar el estado.')))
  }

  const desconectarTelegram = () => {
    if (procesandoTelegram) return
    setProcesandoTelegram(true)
    api
      .desconectarTelegram()
      .then((t) => {
        setProcesandoTelegram(false)
        setTelegram(t)
        setEnlaceTelegram(null)
        setAvisoTelegram('Telegram desconectado: ya no recibirás alertas en ese chat.')
      })
      .catch((err) => {
        setProcesandoTelegram(false)
        setAvisoTelegram(mensajeError(err, 'No pudimos desconectar Telegram.'))
      })
  }

  // ----------------------------------------------------------------------- cuenta

  const guardarNombre = (e: FormEvent) => {
    e.preventDefault()
    const limpio = nombre.replace(/\s+/g, ' ').trim()
    if (limpio.length < 2 || guardandoNombre) return
    setGuardandoNombre(true)
    api
      .guardarPerfil({ nombre: limpio })
      .then((p) => {
        setGuardandoNombre(false)
        setEditandoNombre(false)
        setPerfil(p)
      })
      .catch((err) => {
        setGuardandoNombre(false)
        setError(mensajeError(err, 'No pudimos guardar tu nombre.'))
      })
  }

  const cancelarNombre = () => {
    setNombre(perfil?.usuario.nombre ?? '')
    setEditandoNombre(false)
  }

  // ----------------------------------------------------------------------- empresa

  const actualizarEmpresa = () => {
    if (actualizandoEmpresa) return
    setActualizandoEmpresa(true)
    setAvisoEmpresa(null)
    api
      .actualizarEmpresa()
      .then((p) => {
        setActualizandoEmpresa(false)
        setPerfil(p)
        setAvisoEmpresa(p.avisos?.length ? p.avisos.join(' ') : 'Datos actualizados desde SUNAT y el RNP.')
      })
      .catch((err) => {
        setActualizandoEmpresa(false)
        setAvisoEmpresa(mensajeError(err, 'No pudimos actualizar los datos de la empresa.'))
      })
  }

  // ----------------------------------------------------------------------- keywords

  const guardarKeywords = (keywords: string[]) => {
    const anterior = perfilRef.current
    if (!anterior) return
    setPerfil({ ...anterior, keywords })
    setGuardandoKeywords(true)
    api
      .guardarPerfil({ keywords })
      .then((p) => {
        setGuardandoKeywords(false)
        setPerfil(p)
      })
      .catch((err) => {
        setGuardandoKeywords(false)
        setPerfil(anterior)
        setAvisoKeyword(mensajeError(err, 'No pudimos guardar tus keywords.'))
      })
  }

  const agregarKeyword = (e: FormEvent) => {
    e.preventDefault()
    const kw = nuevaKeyword.replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 80)
    const actuales = perfilRef.current?.keywords ?? []
    setAvisoKeyword(null)
    if (kw.length < 3) {
      setAvisoKeyword('La keyword debe tener al menos 3 letras.')
      return
    }
    if (actuales.includes(kw)) {
      setNuevaKeyword('')
      return
    }
    if (actuales.length >= MAX_KEYWORDS) {
      setAvisoKeyword(`Puedes tener hasta ${MAX_KEYWORDS} keywords.`)
      return
    }
    setNuevaKeyword('')
    guardarKeywords([...actuales, kw])
  }

  const quitarKeyword = (kw: string) => guardarKeywords((perfilRef.current?.keywords ?? []).filter((k) => k !== kw))

  const p = perfil

  return (
    <div className="min-h-full bg-canvas">
      <Topbar quota={quota} />

      <main className={`${container} flex flex-col gap-[22px] pt-6 pb-12 max-[720px]:pt-4`}>
        <header>
          <h1 className="text-[30px]">Mi perfil</h1>
          <p className="mt-1.5 text-[14px] text-muted">Tu cuenta, tu empresa y cómo buscamos licitaciones para ti.</p>
        </header>

        {error ? (
          <div className={`${vacio} text-danger!`}>
            {error}
            <button className={btnSecondary} type="button" onClick={cargar}>
              Reintentar
            </button>
          </div>
        ) : null}

        {loading && !p ? (
          <p className={vacio}>Cargando tu perfil…</p>
        ) : p ? (
          <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)] items-start gap-5 max-[1000px]:grid-cols-[1fr]">
            <div className="flex flex-col gap-5">
              {/* Empresa */}
              <section className={seccion}>
                <div className={seccionHead}>
                  <span className={eyebrow}>🏢 TU EMPRESA</span>
                  {empresa ? (
                    <span className={empresa.sunatOk ? pillSuccess : pillWarning}>{empresa.sunatOk ? 'SUNAT OK' : 'REVISAR SUNAT'}</span>
                  ) : null}
                </div>

                {empresa ? (
                  <>
                    <div className="flex justify-between gap-4 max-[720px]:flex-col">
                      <div>
                        <h2 className="text-[22px]">{empresa.razonSocial}</h2>
                        {empresa.nombreComercial ? <span className={muted}>{empresa.nombreComercial}</span> : null}
                      </div>
                      <div className="flex flex-col gap-0.5 text-right max-[720px]:text-left">
                        <span className={eyebrow}>RUC</span>
                        <strong className={mono}>{empresa.ruc}</strong>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 text-[13.5px] max-[720px]:grid-cols-[1fr] [&>div]:flex [&>div]:flex-col [&>div]:items-start [&>div]:gap-[5px]">
                      <div>
                        <span className={eyebrow}>Condición SUNAT</span>
                        <span className={empresa.sunatOk ? pillSuccess : pillDanger}>{empresa.condicionSunat}</span>
                      </div>
                      <div>
                        <span className={eyebrow}>Registro RNP (OECE)</span>
                        {empresa.rnpVigente ? (
                          <span className={pillPrimary}>VIGENTE</span>
                        ) : (
                          <span className={pillWarning}>NO VIGENTE</span>
                        )}
                      </div>
                      <div>
                        <span className={eyebrow}>Apto para contratar</span>
                        <span className={empresa.aptoContratar ? pillSuccess : pillNeutral}>{empresa.aptoContratar ? 'SÍ' : 'NO'}</span>
                      </div>
                      <div>
                        <span className={eyebrow}>Registros RNP</span>
                        <span>{empresa.tiposRnp.join(' · ') || 'Sin registros'}</span>
                      </div>
                      <div>
                        <span className={eyebrow}>Ubicación</span>
                        <span>{empresa.ubicacion}</span>
                      </div>
                      {empresa.direccion ? (
                        <div>
                          <span className={eyebrow}>Dirección</span>
                          <span>{empresa.direccion}</span>
                        </div>
                      ) : null}
                      {empresa.telefono ? (
                        <div>
                          <span className={eyebrow}>Teléfono (RNP)</span>
                          <span>{empresa.telefono}</span>
                        </div>
                      ) : null}
                      {empresa.email ? (
                        <div>
                          <span className={eyebrow}>Correo (RNP)</span>
                          <span>{empresa.email}</span>
                        </div>
                      ) : null}
                    </div>

                    {empresa.especialidadesRnp.length ? (
                      <div className="flex flex-col gap-2">
                        <span className={eyebrow}>Especialidades RNP</span>
                        <div className="flex flex-wrap gap-2">
                          {empresa.especialidadesRnp.map((esp) => (
                            <span key={esp} className={`${pillNeutral} whitespace-normal!`}>
                              {esp}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {avisoEmpresa ? <p className={aviso}>{avisoEmpresa}</p> : null}
                    <div className={acciones}>
                      <button className={btnSecondary} type="button" disabled={actualizandoEmpresa} onClick={actualizarEmpresa}>
                        {actualizandoEmpresa ? 'Consultando SUNAT y RNP…' : '↻ Actualizar datos SUNAT y RNP'}
                      </button>
                      {empresa.fichaRnpUrl ? (
                        <a className={link} href={empresa.fichaRnpUrl} target="_blank" rel="noopener noreferrer">
                          Ficha RNP ↗
                        </a>
                      ) : null}
                    </div>
                    {empresa.actualizadoEl ? <span className={pequeno}>Datos consultados el {fecha(empresa.actualizadoEl)}</span> : null}
                  </>
                ) : (
                  <div className={`${vacio} flex-col`}>
                    <p>Aún no registras la empresa con la que postulas.</p>
                    <Link className={btnPrimary} to="/onboarding">
                      Registrar mi RUC
                    </Link>
                  </div>
                )}
              </section>

              {/* CIIU */}
              {empresa ? (
                <section className={seccion}>
                  <div className={seccionHead}>
                    <span className={eyebrow}>🧭 ACTIVIDADES ECONÓMICAS (CIIU)</span>
                  </div>
                  <p className={muted}>
                    Buscamos licitaciones cuyos ítems CUBSO corresponden a tus actividades <strong>oficiales de SUNAT</strong>.
                    Las marcadas como <em>genéricas</em> abarcan casi cualquier producto, por eso pesan menos en la afinidad.
                  </p>
                  <ul className="flex flex-col">
                    {ciiusOficiales.length ? (
                      ciiusOficiales.map((c) => (
                        <Ciiu key={c.codigo} c={c}>
                          <span className={pillPrimary}>{c.tipo || 'SUNAT'}</span>
                          {c.generico ? (
                            <span
                              className={pillWarning}
                              title="Actividad muy amplia: calza con casi todo, pesa menos al recomendar"
                            >
                              Genérica
                            </span>
                          ) : null}
                        </Ciiu>
                      ))
                    ) : (
                      <li className={`${ciiuLi} ${muted}`}>SUNAT no registra actividades para esta empresa.</li>
                    )}
                  </ul>
                  {ciiusInferidos.length ? (
                    <details>
                      <summary className="cursor-pointer text-[13px] font-semibold text-muted">
                        {ciiusInferidos.length} actividad(es) inferidas por el RNP (no se usan si hay oficiales)
                      </summary>
                      <ul className="flex flex-col">
                        {ciiusInferidos.map((c) => (
                          <Ciiu key={c.codigo} c={c}>
                            <span className={pillNeutral}>Inferida</span>
                          </Ciiu>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </section>
              ) : null}

              {/* Keywords */}
              <section className={seccion}>
                <div className={seccionHead}>
                  <span className={eyebrow}>🏷️ KEYWORDS</span>
                  <span className={pequeno}>
                    {p.keywords.length} de 30 {guardandoKeywords ? '· guardando…' : ''}
                  </span>
                </div>
                <p className={muted}>Además de tus CIIU, te mostramos las licitaciones que contienen estas palabras.</p>
                <div className="flex flex-wrap gap-2">
                  {p.keywords.length ? (
                    p.keywords.map((kw) => (
                      <span
                        key={kw}
                        className="inline-flex items-center gap-1.5 rounded-full border border-primary-line bg-primary-soft py-1.5 pr-2 pl-3.5 text-[12.5px] font-semibold text-primary"
                      >
                        {kw}
                        <button
                          type="button"
                          className="border-none bg-transparent px-1 py-0.5 text-[10px] font-normal text-inherit opacity-70 hover:opacity-100"
                          aria-label={'Quitar ' + kw}
                          onClick={() => quitarKeyword(kw)}
                        >
                          ✕
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className={muted}>Sin keywords: solo se usan tus actividades CIIU.</span>
                  )}
                </div>
                <form className="flex gap-2" onSubmit={agregarKeyword}>
                  <input
                    className={inputForm}
                    type="text"
                    name="nuevaKeyword"
                    maxLength={80}
                    placeholder="Ej: cemento portland"
                    value={nuevaKeyword}
                    onChange={(e) => setNuevaKeyword(e.target.value)}
                  />
                  <button className={btnSecondary} type="submit" disabled={!nuevaKeyword.trim()}>
                    + Agregar
                  </button>
                </form>
                {avisoKeyword ? <p className={aviso}>{avisoKeyword}</p> : null}
              </section>
            </div>

            <aside className="flex flex-col gap-5">
              {/* Cuenta */}
              <section className={seccion}>
                <div className={seccionHead}>
                  <span className={eyebrow}>👤 TU CUENTA</span>
                </div>
                <div className="flex items-start gap-3.5">
                  <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-[18px] font-bold text-white">
                    {(p.usuario.nombre || p.usuario.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {editandoNombre ? (
                      <form className="flex gap-2" onSubmit={guardarNombre}>
                        <input
                          className={inputForm}
                          type="text"
                          name="nombre"
                          maxLength={120}
                          aria-label="Nombre"
                          value={nombre}
                          onChange={(e) => setNombre(e.target.value)}
                        />
                        <button
                          className={`${btnPrimary} px-3! py-2! text-[13px]!`}
                          type="submit"
                          disabled={guardandoNombre || nombre.trim().length < 2}
                        >
                          Guardar
                        </button>
                        <button className={`${btnGhost} px-3! py-2! text-[13px]!`} type="button" onClick={cancelarNombre}>
                          Cancelar
                        </button>
                      </form>
                    ) : (
                      <>
                        <strong>{p.usuario.nombre || 'Sin nombre'}</strong>
                        <button className={link} type="button" onClick={() => setEditandoNombre(true)}>
                          Editar nombre
                        </button>
                      </>
                    )}
                    <span className={`${muted} [overflow-wrap:anywhere]`}>{p.usuario.email}</span>
                  </div>
                </div>
                <button className={`${btnSecondary} w-full`} type="button" onClick={() => logout()}>
                  Cerrar sesión
                </button>
              </section>

              {/* Desbloqueos */}
              {cupo ? (
                <section className={seccion}>
                  <div className={seccionHead}>
                    <span className={eyebrow}>🔓 DESBLOQUEOS</span>
                    <span className={cupo.disponibles > 0 ? pillSuccess : pillWarning}>{cupo.disponibles} disponibles</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <strong className="font-serif text-[28px] font-medium">
                      {cupo.usados} <span className={muted}>de {cupo.limite}</span>
                    </strong>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-canvas"
                      role="progressbar"
                      aria-valuenow={cupo.usados}
                      aria-valuemin={0}
                      aria-valuemax={cupo.limite}
                    >
                      <div
                        className="h-full rounded-[inherit] bg-primary transition-[width] duration-300 ease-in-out"
                        style={{ width: `${porcentajeCupo}%` }}
                      />
                    </div>
                    <span className={pequeno}>Cada desbloqueo muestra las bases y el análisis ISO con IA.</span>
                  </div>
                  <Link className={`${btnSecondary} w-full`} to="/app/desbloqueos">
                    Ver mis desbloqueos →
                  </Link>
                </section>
              ) : null}

              {/* Telegram */}
              {p.ruc && telegram ? (
                <section className={seccion}>
                  <div className={seccionHead}>
                    <span className={eyebrow}>🔔 ALERTAS POR TELEGRAM</span>
                    {telegram.vinculado ? (
                      <span className={telegram.activo ? pillSuccess : pillWarning}>{telegram.activo ? 'Conectado' : 'En pausa'}</span>
                    ) : null}
                  </div>
                  {!telegram.botDisponible ? (
                    <p className={muted}>El bot de alertas no está disponible en este momento.</p>
                  ) : telegram.vinculado && !enlaceTelegram ? (
                    <>
                      <p className={muted}>
                        Recibes las licitaciones nuevas de tu rubro en{' '}
                        <strong>{telegram.username ? '@' + telegram.username : 'tu chat de Telegram'}</strong>
                        {telegram.vinculadoEl ? ` desde el ${fecha(telegram.vinculadoEl)}` : ''}.
                        {!telegram.activo ? ' Están en pausa: envía /reanudar al bot.' : ''}
                      </p>
                      <div className={acciones}>
                        <button className={btnSecondary} type="button" disabled={procesandoTelegram} onClick={conectarTelegram}>
                          Usar otro chat
                        </button>
                        <button className={btnGhost} type="button" disabled={procesandoTelegram} onClick={desconectarTelegram}>
                          Desconectar
                        </button>
                      </div>
                    </>
                  ) : enlaceTelegram ? (
                    <>
                      <EnlaceTelegram enlace={enlaceTelegram} />
                      <button className={`${btnSecondary} w-full`} type="button" onClick={verificarTelegram}>
                        Ya pulsé Iniciar
                      </button>
                    </>
                  ) : (
                    <>
                      <p className={muted}>
                        Te avisamos al instante cuando se publique una licitación de tu rubro. Solo para tu empresa (RUC {p.ruc}).
                      </p>
                      <button className={`${btnPrimary} w-full`} type="button" disabled={procesandoTelegram} onClick={conectarTelegram}>
                        {procesandoTelegram ? 'Generando enlace…' : 'Conectar Telegram'}
                      </button>
                    </>
                  )}
                  {avisoTelegram ? <p className={aviso}>{avisoTelegram}</p> : null}
                </section>
              ) : null}

              {/* Historial SEACE */}
              {p.ruc ? (
                <section className={seccion}>
                  <div className={seccionHead}>
                    <span className={eyebrow}>📊 TU HISTORIAL EN EL SEACE</span>
                  </div>
                  {historial ? (
                    historial.procesos ? (
                      <>
                        <div className="grid grid-cols-[1fr_1fr] gap-3 [&>div]:flex [&>div]:flex-col [&>div]:gap-0.5 [&>div]:rounded-md [&>div]:bg-canvas [&>div]:p-3 [&_strong]:font-serif [&_strong]:text-[22px] [&_strong]:font-medium">
                          <div>
                            <strong>{historial.procesos}</strong>
                            <span className={muted}>procesos postulados</span>
                          </div>
                          <div>
                            <strong>{historial.ganados}</strong>
                            <span className={muted}>ganados ({tasaExito}%)</span>
                          </div>
                          <div className="col-span-full">
                            <strong>{soles(historial.montoAdjudicado)}</strong>
                            <span className={muted}>monto adjudicado</span>
                          </div>
                        </div>
                        {objetosHistorial.length ? (
                          <div className="flex flex-wrap gap-2">
                            {objetosHistorial.map(([objeto, n]) => (
                              <span key={objeto} className={`${pillNeutral} whitespace-normal!`}>
                                {objeto}: {n}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <span className={eyebrow}>Últimos procesos</span>
                        <ul className="flex flex-col gap-3">
                          {historial.ultimos.map((u, i) => (
                            <li key={i} className="flex flex-col gap-[3px]">
                              <span className={`${mono} text-[12.5px]`}>{u.codigo}</span>
                              <span className="text-[13px] leading-[1.4]">{u.titulo}</span>
                              <span className={pequeno}>
                                {u.entidad} · {fecha(u.fecha)}
                                {u.condicion.toLowerCase().startsWith('ganador') ? (
                                  <>
                                    {' '}
                                    · <strong className="text-success">Ganado {u.monto ? soles(u.monto) : ''}</strong>
                                  </>
                                ) : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className={muted}>No encontramos postulaciones de tu empresa en el SEACE todavía.</p>
                    )
                  ) : (
                    <p className={muted}>Cargando historial…</p>
                  )}
                </section>
              ) : null}
            </aside>
          </div>
        ) : null}
      </main>
    </div>
  )
}
