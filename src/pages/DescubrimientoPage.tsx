import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DetalleDesbloqueo } from '../components/DetalleDesbloqueo'
import { KpiCard } from '../components/KpiCard'
import { Topbar } from '../components/Topbar'
import * as api from '../lib/api'
import { esCancelacion, mensajeError } from '../lib/api'
import { soles, solesCompacto } from '../lib/formato'
import { FUENTES, descripcionFuente, etiquetaFuente } from '../lib/fuentes'
import {
  btnGhost,
  btnPrimary,
  btnSecondary,
  card,
  container,
  dialog,
  dialogAcciones,
  dialogCupo,
  dialogError,
  dialogLic,
  dialogLista,
  mono,
  overlay,
  pillNeutral,
  pillPrimary,
} from '../lib/ui'
import type {
  Cupo,
  Desbloqueo,
  FiltrosLicitaciones,
  Licitacion,
  OrdenLicitaciones,
  PaginaLicitaciones,
} from '../types/models'

const POR_PAGINA = 10
const MAX_KEYWORDS = 30

const DEPARTAMENTOS = [
  'AMAZONAS', 'ANCASH', 'APURIMAC', 'AREQUIPA', 'AYACUCHO', 'CAJAMARCA', 'CALLAO', 'CUSCO', 'HUANCAVELICA',
  'HUANUCO', 'ICA', 'JUNIN', 'LA LIBERTAD', 'LAMBAYEQUE', 'LIMA', 'LORETO', 'MADRE DE DIOS', 'MOQUEGUA',
  'PASCO', 'PIURA', 'PUNO', 'SAN MARTIN', 'TACNA', 'TUMBES', 'UCAYALI',
]
const OBJETOS = ['Bienes', 'Servicios', 'Obras', 'Consultoría', 'Consultoría de Obra']
const ORDENES: { valor: OrdenLicitaciones; label: string }[] = [
  { valor: 'afinidad', label: 'Mayor afinidad' },
  { valor: 'cierre', label: 'Cierre más próximo' },
  { valor: 'recientes', label: 'Más recientes' },
  { valor: 'monto', label: 'Mayor monto' },
]

const FILTROS_INICIALES: FiltrosLicitaciones = {
  keywords: [],
  q: '',
  departamento: '',
  objeto: '',
  fuente: '',
  keyword: null,
  soloPerfil: true,
  orden: 'afinidad',
  pagina: 1,
}

/** [1, '…', 4, 5, 6, '…', 20] */
function paginasVisibles(actual: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set([1, total, actual - 1, actual, actual + 1].filter((n) => n >= 1 && n <= total))
  const orden = [...set].sort((a, b) => a - b)
  const out: (number | '…')[] = []
  orden.forEach((n, i) => {
    if (i > 0 && n - orden[i - 1] > 1) out.push('…')
    out.push(n)
  })
  return out
}

function cierre(l: Licitacion): string {
  if (!l.fechaLimite) return ''
  const d = new Date(l.fechaLimite)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ----------------------------------------------------------------------------- estilos

const filtersLabel = 'mb-3 block text-[11px] font-bold tracking-[0.05em] text-faint'
const chipBase =
  'inline-flex items-center gap-2 rounded-full border text-[12.5px] font-semibold max-[720px]:max-w-full'
const chipColor = (activo: boolean) =>
  activo ? 'border-primary bg-primary text-white' : 'border-line-strong bg-white text-muted'
const filterSelect =
  'flex items-center gap-2 text-[13px] font-semibold text-muted max-[720px]:w-full max-[720px]:justify-between [&_select]:rounded-sm [&_select]:border [&_select]:border-line [&_select]:bg-white [&_select]:px-2 [&_select]:py-[5px] [&_select]:text-[13px] [&_select]:font-semibold [&_select]:text-ink max-[720px]:[&_select]:max-w-[65%]'
const emptyState =
  'flex flex-wrap items-center justify-center gap-3 py-[18px] text-center text-[14px] text-muted [&_a]:font-semibold [&_a]:text-primary'
const entidad = 'text-[12.5px] text-muted'
const tableBtn = 'px-3! py-2! text-[12.5px]!'
const rowGrid =
  'grid grid-cols-[1.25fr_0.75fr_0.8fr_0.8fr_2.6fr_0.9fr] items-start gap-4 border-b border-line px-5 py-4 text-[13.5px] last:border-b-0 max-[1200px]:grid-cols-[1fr] max-[1200px]:gap-1.5'

export function DescubrimientoPage() {
  const navigate = useNavigate()

  const [filtros, setFiltros] = useState<FiltrosLicitaciones>(FILTROS_INICIALES)
  const [pagina, setPagina] = useState<PaginaLicitaciones | null>(null)
  const [cupo, setCupo] = useState<Cupo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [textoBusqueda, setTextoBusqueda] = useState('')
  const [nuevaKeyword, setNuevaKeyword] = useState('')
  const [avisoKeyword, setAvisoKeyword] = useState<string | null>(null)

  /** Licitación que se va a desbloquear (diálogo de confirmación). */
  const [confirmar, setConfirmar] = useState<Licitacion | null>(null)
  const [desbloqueando, setDesbloqueando] = useState(false)
  const [errorDesbloqueo, setErrorDesbloqueo] = useState<string | null>(null)
  /** Panel de detalle de una licitación desbloqueada. */
  const [detalle, setDetalle] = useState<{ lic: Licitacion; inicial: Desbloqueo | null } | null>(null)

  const filtrosRef = useRef(filtros)
  const paginaRef = useRef(pagina)
  useEffect(() => {
    paginaRef.current = pagina
  }, [pagina])
  const peticion = useRef<AbortController | null>(null)
  const busquedaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const items = pagina?.items ?? []
  const quota = cupo ? `${cupo.usados}/${cupo.limite}` : '—'
  const paginas = paginasVisibles(filtros.pagina, pagina?.totalPaginas ?? 1)
  const hayFiltros = !!(filtros.q || filtros.departamento || filtros.objeto || filtros.fuente || filtros.keyword || !filtros.soloPerfil)

  // Si el usuario cambia filtros rápido, solo cuenta la última petición.
  const cargar = (f: FiltrosLicitaciones) => {
    peticion.current?.abort()
    const ctrl = new AbortController()
    peticion.current = ctrl
    setLoading(true)
    setError(null)
    api
      .licitaciones(f, POR_PAGINA, ctrl.signal)
      .then((p) => {
        if (ctrl.signal.aborted) return
        setLoading(false)
        setPagina(p)
        setCupo(p.desbloqueos)
        // Si la página quedó fuera de rango (p. ej. cambió el total), se vuelve a la última.
        if (!p.items.length && p.total > 0 && filtrosRef.current.pagina > p.totalPaginas) {
          actualizar({ pagina: p.totalPaginas }, false)
        }
      })
      .catch((err) => {
        if (esCancelacion(err) || ctrl.signal.aborted) return
        setLoading(false)
        setError(mensajeError(err, 'No se pudieron cargar las licitaciones.'))
      })
  }

  const actualizar = (cambios: Partial<FiltrosLicitaciones>, reiniciarPagina = true) => {
    const f = filtrosRef.current
    const nuevos = { ...f, ...cambios, pagina: reiniciarPagina ? 1 : (cambios.pagina ?? f.pagina) }
    filtrosRef.current = nuevos
    setFiltros(nuevos)
    cargar(nuevos)
  }

  useEffect(() => {
    let activo = true
    api
      .perfil()
      .then((p) => {
        if (!activo) return
        if (!p.ruc && !p.keywords.length) {
          navigate('/onboarding')
          return
        }
        setCupo(p.desbloqueos)
        actualizar({ keywords: p.keywords })
      })
      .catch((err) => {
        if (!activo) return
        setLoading(false)
        setError(mensajeError(err, 'No pudimos cargar tu perfil.'))
      })
    return () => {
      activo = false
      peticion.current?.abort()
      if (busquedaTimer.current) clearTimeout(busquedaTimer.current)
    }
    // Solo al entrar a la página
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ----------------------------------------------------------------------- búsqueda y filtros

  const recargar = () => cargar(filtrosRef.current)

  const onBuscar = (texto: string) => {
    setTextoBusqueda(texto)
    if (busquedaTimer.current) clearTimeout(busquedaTimer.current)
    busquedaTimer.current = setTimeout(() => actualizar({ q: texto.trim().slice(0, 120) }), 400)
  }

  const buscarAhora = () => {
    if (busquedaTimer.current) clearTimeout(busquedaTimer.current)
    actualizar({ q: textoBusqueda.trim().slice(0, 120) })
  }

  const limpiarFiltros = () => {
    setTextoBusqueda('')
    actualizar({ q: '', departamento: '', objeto: '', fuente: '', keyword: null, soloPerfil: true, orden: 'afinidad' })
  }

  const irAPagina = (n: number) => {
    const total = paginaRef.current?.totalPaginas ?? 1
    const destino = Math.min(Math.max(1, n), total)
    if (destino === filtrosRef.current.pagina && paginaRef.current?.items.length) return
    actualizar({ pagina: destino }, false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ----------------------------------------------------------------------- keywords

  const guardarKeywords = (keywords: string[], keywordActiva = filtrosRef.current.keyword) => {
    const anteriores = filtrosRef.current.keywords
    actualizar({ keywords, keyword: keywordActiva })
    api.guardarPerfil({ keywords }).catch((err) => {
      setAvisoKeyword(mensajeError(err, 'No pudimos guardar tus keywords.'))
      actualizar({ keywords: anteriores })
    })
  }

  const agregarKeyword = (e: FormEvent) => {
    e.preventDefault()
    const kw = nuevaKeyword.replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 80)
    const actuales = filtrosRef.current.keywords
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
      setAvisoKeyword(`Puedes tener hasta ${MAX_KEYWORDS} keywords. Quita alguna para agregar otra.`)
      return
    }
    setNuevaKeyword('')
    guardarKeywords([...actuales, kw])
    api
      .conteoKeyword(kw)
      .then((r) => {
        if (r.abiertas === 0) setAvisoKeyword(`Hoy no hay licitaciones abiertas con «${kw}». Te avisaremos cuando salga una.`)
      })
      .catch(() => {})
  }

  const quitarKeyword = (kw: string) => {
    const f = filtrosRef.current
    guardarKeywords(
      f.keywords.filter((k) => k !== kw),
      f.keyword === kw ? null : f.keyword,
    )
  }

  // ----------------------------------------------------------------------- desbloqueo

  const pedirDesbloqueo = (l: Licitacion) => {
    if (l.desbloqueada) {
      setDetalle({ lic: l, inicial: null })
      return
    }
    setErrorDesbloqueo(null)
    setConfirmar(l)
  }

  const cancelarDesbloqueo = () => {
    if (!desbloqueando) setConfirmar(null)
  }

  const confirmarDesbloqueo = () => {
    const l = confirmar
    if (!l || desbloqueando) return
    setDesbloqueando(true)
    setErrorDesbloqueo(null)
    api
      .desbloquear(l.id)
      .then((d) => {
        setDesbloqueando(false)
        setConfirmar(null)
        setCupo({ usados: d.usados, limite: d.limite, disponibles: d.disponibles })
        const actualizada: Licitacion = { ...l, desbloqueada: true, basesUrl: d.basesUrl ?? null, fichaUrl: d.fichaUrl ?? null }
        setPagina((p) => (p ? { ...p, items: p.items.map((x) => (x.id === l.id ? actualizada : x)) } : p))
        setDetalle({ lic: actualizada, inicial: d })
      })
      .catch((err) => {
        setDesbloqueando(false)
        setErrorDesbloqueo(mensajeError(err, 'No se pudo desbloquear la licitación.'))
      })
  }

  return (
    <div className="min-h-full bg-canvas">
      <Topbar quota={quota} />

      <main className={`${container} flex flex-col gap-[22px] pt-6 pb-12 max-[720px]:pt-4`}>
        <section className={`${card} px-[22px] py-5 max-[720px]:p-4`}>
          <div className="mb-[18px] flex flex-wrap items-center gap-4 border-b border-line pb-[18px]">
            <label
              className="flex flex-[1_1_420px] items-center gap-2.5 rounded-md border border-line-strong bg-white px-3.5 text-faint focus-within:border-primary focus-within:shadow-[0_0_0_3px_var(--color-primary-soft)] max-[720px]:basis-full"
              htmlFor="buscador"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
                <path d="m11 11 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                id="buscador"
                className="min-w-0 flex-1 border-none bg-transparent py-3 text-[14px] text-ink outline-none"
                type="search"
                maxLength={120}
                placeholder="Buscar por producto, servicio, entidad o código (ej: cemento, puente, LP-ABR-6-2026…)"
                value={textoBusqueda}
                onChange={(e) => onBuscar(e.target.value)}
                onKeyUp={(e) => {
                  if (e.key === 'Enter') buscarAhora()
                }}
              />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-muted">
              <input
                className="m-[3px_3px_3px_4px]"
                type="checkbox"
                checked={!filtros.soloPerfil}
                onChange={(e) => actualizar({ soloPerfil: !e.target.checked })}
              />
              Ver todas las abiertas (no solo mi rubro)
            </label>
          </div>

          <div className="mb-[18px] flex items-start gap-5 border-b border-line pb-[18px] max-[720px]:flex-col max-[720px]:gap-1">
            <span className={filtersLabel}>KEYWORDS</span>
            <div className="flex flex-1 flex-wrap gap-2 max-[720px]:w-full">
              <button
                className={`${chipBase} ${chipColor(filtros.keyword === null)} px-3.5 py-[7px]`}
                onClick={() => actualizar({ keyword: null })}
              >
                Todas
              </button>
              {filtros.keywords.length ? (
                filtros.keywords.map((kw) => (
                  <span key={kw} className={`${chipBase} ${chipColor(filtros.keyword === kw)} gap-0! overflow-hidden p-0!`}>
                    <button
                      type="button"
                      className="border-none bg-transparent py-[7px] pr-1 pl-3.5 text-inherit max-[720px]:text-left max-[720px]:[overflow-wrap:anywhere]"
                      onClick={() => actualizar({ keyword: filtros.keyword === kw ? null : kw })}
                    >
                      {kw}
                    </button>
                    <button
                      type="button"
                      className="border-none bg-transparent py-[7px] pr-3 pl-1.5 text-inherit opacity-70 hover:opacity-100"
                      aria-label={'Quitar ' + kw}
                      onClick={() => quitarKeyword(kw)}
                    >
                      ✕
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-[13px] text-muted">Sin keywords: se usan solo las actividades CIIU de tu RUC.</span>
              )}
              <form className="inline-flex gap-1.5 max-[720px]:w-full" onSubmit={agregarKeyword}>
                <input
                  type="text"
                  name="nuevaKeyword"
                  maxLength={80}
                  placeholder="+ Agregar keyword"
                  className="min-w-[190px] rounded-full border border-dashed border-line-strong px-3.5 py-[7px] text-[12.5px] focus:border-solid focus:border-primary focus:outline-none max-[720px]:min-w-0 max-[720px]:flex-1"
                  value={nuevaKeyword}
                  onChange={(e) => setNuevaKeyword(e.target.value)}
                />
                <button
                  type="submit"
                  className={`${btnSecondary} rounded-full! px-3! py-1.5! text-[12.5px]!`}
                  disabled={!nuevaKeyword.trim()}
                >
                  Agregar
                </button>
              </form>
            </div>
          </div>
          {avisoKeyword ? <p className="-mt-2 mb-4 text-[13px] text-warning">{avisoKeyword}</p> : null}

          <div className="flex flex-wrap items-center gap-[18px] max-[720px]:gap-2.5">
            <span className={filtersLabel}>FILTROS</span>
            <label className={filterSelect}>
              Departamento
              <select value={filtros.departamento} onChange={(e) => actualizar({ departamento: e.target.value })}>
                <option value="">Todos</option>
                {DEPARTAMENTOS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className={filterSelect}>
              Objeto
              <select value={filtros.objeto} onChange={(e) => actualizar({ objeto: e.target.value })}>
                <option value="">Todos</option>
                {OBJETOS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            <label className={filterSelect}>
              Fuente
              <select value={filtros.fuente} onChange={(e) => actualizar({ fuente: e.target.value })}>
                <option value="">Todas</option>
                {FUENTES.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={filterSelect}>
              Ordenar
              <select value={filtros.orden} onChange={(e) => actualizar({ orden: e.target.value as OrdenLicitaciones })}>
                {ORDENES.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {hayFiltros ? (
              <button className={`${btnGhost} px-2.5! py-1.5! text-[13px]!`} type="button" onClick={limpiarFiltros}>
                Limpiar filtros
              </button>
            ) : null}
          </div>
        </section>

        <section className="grid grid-cols-4 gap-4 max-[1200px]:grid-cols-2 max-[720px]:gap-2.5">
          <KpiCard
            label="Licitaciones abiertas"
            value={(pagina?.total ?? 0).toLocaleString('es-PE')}
            hint="que calzan con tu búsqueda"
          />
          <KpiCard label="Monto referencial" value={solesCompacto(pagina?.montoTotal ?? 0)} hint="suma de las encontradas" />
          <KpiCard
            label="Alta afinidad"
            value={(pagina?.altaAfinidad ?? 0).toLocaleString('es-PE')}
            hint="afinidad de 80% o más"
          />
          <KpiCard
            label="Desbloqueos"
            value={cupo ? cupo.disponibles + ' de ' + cupo.limite : '—'}
            hint="disponibles en tu cuenta"
            valueColor="var(--color-success)"
          />
        </section>

        <section>
          <div className="mb-3.5 flex items-center justify-between max-[720px]:flex-wrap max-[720px]:gap-1.5">
            <h2 className="text-[18px]">
              Resultados{' '}
              <span className="font-sans text-[14px] font-normal text-muted">
                · {filtros.keyword ?? (filtros.soloPerfil ? 'tu rubro y keywords' : 'todas las abiertas')}
                {filtros.q ? ` · «${filtros.q}»` : ''}
              </span>
            </h2>
            {loading ? (
              <span className="text-[13px] text-muted">Actualizando…</span>
            ) : filtros.q && filtros.soloPerfil ? (
              <button
                className={`${btnGhost} px-2.5! py-1.5! text-[13px]! text-primary!`}
                type="button"
                onClick={() => actualizar({ soloPerfil: false })}
              >
                Buscar «{filtros.q}» en todas las abiertas →
              </button>
            ) : null}
          </div>

          {error ? (
            <div className={`${emptyState} text-danger!`}>
              {error}
              <button className={btnSecondary} type="button" onClick={recargar}>
                Reintentar
              </button>
            </div>
          ) : !pagina && loading ? (
            <p className={emptyState}>Buscando licitaciones abiertas para tu empresa…</p>
          ) : pagina && !items.length ? (
            <div className={emptyState}>
              No hay licitaciones abiertas con estos criterios.
              {hayFiltros ? (
                <button className={btnSecondary} type="button" onClick={limpiarFiltros}>
                  Limpiar filtros
                </button>
              ) : (
                <span>
                  Agrega otra keyword o <Link to="/app/perfil">revisa tu perfil</Link>.
                </span>
              )}
            </div>
          ) : null}

          {items.length ? (
            <>
              <div className={`${card} overflow-hidden transition-opacity duration-150 ${loading ? 'opacity-55' : ''}`}>
                <div
                  className={`${rowGrid} items-center! bg-canvas text-[11px]! font-bold tracking-[0.04em] text-faint uppercase max-[1200px]:hidden`}
                >
                  <span>Licitación</span>
                  <span>Ubicación</span>
                  <span>Publicación</span>
                  <span>Objeto</span>
                  <span>Monto · Oportunidad</span>
                  <span>Acción</span>
                </div>
                {items.map((l) => (
                  <div key={l.id} className={rowGrid}>
                    <span>
                      {l.esNueva ? <span className={`${pillPrimary} mb-1.5 inline-block!`}>Nueva</span> : null}
                      <span className={`${mono} block text-[12px] text-muted`}>{l.codigo}</span>
                      <span
                        className="mt-1.5 mr-1.5 inline-block rounded-full border border-line px-[7px] py-px text-[10.5px] font-bold tracking-[0.03em] text-faint"
                        title={descripcionFuente(l.fuente)}
                      >
                        {etiquetaFuente(l.fuente)}
                      </span>
                      {l.matchPorcentaje ? (
                        <span
                          className={`mt-1.5 inline-block text-[12px] font-bold ${l.matchPorcentaje >= 80 ? 'text-success' : 'text-muted'}`}
                        >
                          {l.matchPorcentaje}%
                        </span>
                      ) : null}
                    </span>
                    <span>{l.ubicacion}</span>
                    <span>
                      {l.publicacion}
                      {cierre(l) ? <span className={entidad}> Cierra {cierre(l)}</span> : null}
                    </span>
                    <span>
                      <span className={pillNeutral}>{l.objeto}</span>
                    </span>
                    <span className="flex flex-col gap-1">
                      <strong className="leading-[1.4] font-semibold">{l.titulo}</strong>
                      <span className={entidad}>{l.entidad}</span>
                      {l.valorReferencial > 0 ? (
                        <span className="text-[12.5px] text-muted">
                          Valor referencial: <strong className="leading-[1.4] font-semibold">{soles(l.valorReferencial)}</strong>
                        </span>
                      ) : null}
                      {l.motivos.length ? (
                        <span className="text-[12.5px] text-muted" title={l.motivos.join(' · ')}>
                          🎯 {l.motivos[0]}
                        </span>
                      ) : null}
                      {l.keywords.length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {l.keywords.map((k) => (
                            <span key={k} className={`${pillPrimary} px-2! py-0.5! text-[11px]! whitespace-normal!`}>
                              {k}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-col items-stretch gap-2">
                      {l.desbloqueada ? (
                        <>
                          {l.basesUrl ? (
                            <a className={`${btnPrimary} ${tableBtn}`} href={l.basesUrl} target="_blank" rel="noopener noreferrer">
                              ⬇ Bases
                            </a>
                          ) : null}
                          <button
                            className={`${btnSecondary} ${tableBtn}`}
                            type="button"
                            onClick={() => setDetalle({ lic: l, inicial: null })}
                          >
                            Ver análisis
                          </button>
                        </>
                      ) : (
                        <button
                          className={`${btnSecondary} ${tableBtn}`}
                          type="button"
                          disabled={cupo?.disponibles === 0}
                          title={cupo?.disponibles === 0 ? 'Ya usaste todos tus desbloqueos' : 'Ver bases y análisis ISO con IA'}
                          aria-label={'Desbloquear ' + l.codigo}
                          onClick={() => pedirDesbloqueo(l)}
                        >
                          🔓 Desbloquear
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <nav className="mt-[18px] flex flex-wrap items-center justify-center gap-3 max-[720px]:gap-2" aria-label="Paginación">
                <button
                  className={`${btnSecondary} max-[720px]:px-3 max-[720px]:py-[9px] max-[720px]:text-[13px]`}
                  type="button"
                  disabled={filtros.pagina <= 1 || loading}
                  onClick={() => irAPagina(filtros.pagina - 1)}
                >
                  ← Anterior
                </button>
                <span className="flex items-center gap-1">
                  {paginas.map((p, i) =>
                    p === '…' ? (
                      <span key={`dots-${i}`} className="px-1 text-faint">
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        className={`h-9 min-w-9 rounded-sm border text-[13px] font-semibold disabled:cursor-default ${
                          p === filtros.pagina ? 'border-primary bg-primary text-white' : 'border-line bg-white text-muted'
                        }`}
                        aria-current={p === filtros.pagina ? 'page' : undefined}
                        disabled={loading}
                        onClick={() => irAPagina(p)}
                      >
                        {p}
                      </button>
                    ),
                  )}
                </span>
                <button
                  className={`${btnSecondary} max-[720px]:px-3 max-[720px]:py-[9px] max-[720px]:text-[13px]`}
                  type="button"
                  disabled={filtros.pagina >= (pagina?.totalPaginas ?? 1) || loading}
                  onClick={() => irAPagina(filtros.pagina + 1)}
                >
                  Siguiente →
                </button>
              </nav>
              <p className="mt-2.5 text-center text-[12.5px] text-faint">
                Página {filtros.pagina} de {pagina?.totalPaginas} · {pagina?.total?.toLocaleString('es-PE')} licitaciones abiertas
              </p>
            </>
          ) : null}
        </section>
      </main>

      {confirmar ? (
        <div className={overlay} onClick={cancelarDesbloqueo}>
          <div
            className={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dlg-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="dlg-titulo">¿Desbloquear esta licitación?</h3>
            <p className={dialogLic}>
              <span className={mono}>{confirmar.codigo}</span> · {confirmar.titulo}
            </p>
            <ul className={dialogLista}>
              <li>
                Enlace para descargar las <strong>bases administrativas</strong>.
              </li>
              <li>
                Análisis con IA: <strong>ISO</strong> que piden las bases y recomendación para tu empresa.
              </li>
            </ul>
            <p className={dialogCupo}>
              Usarás 1 de tus {cupo?.limite} desbloqueos · te quedarán <strong>{(cupo?.disponibles ?? 1) - 1}</strong>.
            </p>
            {errorDesbloqueo ? (
              <p className={dialogError} role="alert">
                {errorDesbloqueo}
              </p>
            ) : null}
            <div className={`${dialogAcciones} max-[720px]:flex-col-reverse max-[720px]:[&>button]:w-full`}>
              <button className={btnSecondary} type="button" disabled={desbloqueando} onClick={cancelarDesbloqueo}>
                Cancelar
              </button>
              <button className={btnPrimary} type="button" disabled={desbloqueando} onClick={confirmarDesbloqueo}>
                {desbloqueando ? 'Desbloqueando…' : '🔓 Desbloquear'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {detalle ? (
        <DetalleDesbloqueo lic={detalle.lic} inicial={detalle.inicial} onCerrar={() => setDetalle(null)} />
      ) : null}
    </div>
  )
}
