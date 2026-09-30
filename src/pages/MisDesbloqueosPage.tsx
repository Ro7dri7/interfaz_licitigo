import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DetalleDesbloqueo, type LicitacionResumen } from '../components/DetalleDesbloqueo'
import { KpiCard } from '../components/KpiCard'
import { Topbar } from '../components/Topbar'
import * as api from '../lib/api'
import { mensajeError } from '../lib/api'
import { soles, solesCompacto } from '../lib/formato'
import { FUENTES, descripcionFuente, etiquetaFuente } from '../lib/fuentes'
import { btnPrimary, btnSecondary, card, container, mono, pillDanger, pillNeutral, pillSuccess, pillVeredicto, spinner } from '../lib/ui'
import type { Cupo, Desbloqueo, DesbloqueoItem } from '../types/models'

type Filtro = 'todas' | 'abiertas' | 'cerradas' | 'postular'

const REFRESCO_MS = 8000
const REFRESCO_MAX = 60

const FILTROS: { valor: Filtro; label: string }[] = [
  { valor: 'todas', label: 'Todas' },
  { valor: 'abiertas', label: 'Siguen abiertas' },
  { valor: 'cerradas', label: 'Cerradas' },
  { valor: 'postular', label: 'Recomendadas para postular' },
]

function esPostular(v: string | null): boolean {
  return !!v && v.toLowerCase().startsWith('postular')
}

function normalizar(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function fecha(iso: string | null, conHora = false): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: 'short',
    year: conHora ? undefined : 'numeric',
    ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

/** "Cierra en 3 días", "Cierra hoy"… (solo si hay fecha límite). */
function cierre(i: DesbloqueoItem): string {
  if (!i.fechaLimite) return ''
  const ms = new Date(i.fechaLimite).getTime() - Date.now()
  if (isNaN(ms)) return ''
  if (ms <= 0) return 'Plazo vencido'
  const dias = Math.floor(ms / 86_400_000)
  if (dias === 0) return `Cierra hoy · ${fecha(i.fechaLimite, true)}`
  if (dias === 1) return `Cierra mañana · ${fecha(i.fechaLimite, true)}`
  return `Cierra en ${dias} días · ${fecha(i.fechaLimite, true)}`
}

function estadoAnalisisTexto(i: DesbloqueoItem): string {
  switch (i.estadoAnalisis) {
    case 'procesando':
    case 'pendiente':
      return 'Analizando…'
    case 'error':
      return 'Análisis con error'
    case 'sin_analisis':
      return 'Sin análisis'
    default:
      return 'Análisis listo'
  }
}

const vacio = 'flex flex-wrap items-center justify-center gap-3 py-[18px] text-center text-[14px] text-muted'
const meta = 'text-[12.5px] text-muted'
const filaBtn = 'px-3! py-2! text-[12.5px]!'
const fila =
  'grid grid-cols-[1.1fr_2.6fr_1fr_0.9fr] items-start gap-[18px] border-b border-line px-5 py-4 text-[13.5px] last:border-b-0 max-[1100px]:grid-cols-[1fr] max-[1100px]:gap-2.5'

export function MisDesbloqueosPage() {
  const [items, setItems] = useState<DesbloqueoItem[]>([])
  const [cupo, setCupo] = useState<Cupo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [texto, setTexto] = useState('')
  const [fuente, setFuente] = useState('')
  const [detalle, setDetalle] = useState<LicitacionResumen | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refrescos = useRef(0)
  /** Vigencia del montaje actual: las respuestas de un montaje anterior (StrictMode, cierre) se descartan. */
  const montaje = useRef({ vigente: false })

  const quota = cupo ? `${cupo.usados}/${cupo.limite}` : '—'
  const abiertas = items.filter((i) => i.abierta).length
  const montoTotal = items.reduce((s, i) => s + i.valorReferencial, 0)
  const paraPostular = items.filter((i) => esPostular(i.veredicto)).length

  const q = normalizar(texto)
  const visibles = items.filter((i) => {
    if (fuente && i.fuente !== fuente) return false
    if (filtro === 'abiertas' && !i.abierta) return false
    if (filtro === 'cerradas' && i.abierta) return false
    if (filtro === 'postular' && !esPostular(i.veredicto)) return false
    if (q && !normalizar(`${i.codigo} ${i.titulo} ${i.entidad}`).includes(q)) return false
    return true
  })

  const pedir = useCallback(function pedir(silencioso: boolean) {
    const m = montaje.current
    api
      .misDesbloqueos()
      .then((r) => {
        if (!m.vigente) return
        setLoading(false)
        setItems(r.items)
        setCupo({ usados: r.usados, limite: r.limite, disponibles: r.disponibles })
        // Si hay análisis en curso, la lista se refresca sola hasta que terminen.
        if (timer.current) clearTimeout(timer.current)
        const enCurso = r.items.some((i) => i.estadoAnalisis === 'procesando' || i.estadoAnalisis === 'pendiente')
        if (enCurso && refrescos.current < REFRESCO_MAX) {
          refrescos.current++
          timer.current = setTimeout(() => pedir(true), REFRESCO_MS)
        }
      })
      .catch((err) => {
        if (!m.vigente) return
        setLoading(false)
        if (!silencioso) setError(mensajeError(err, 'No se pudieron cargar tus desbloqueos.'))
      })
  }, [])

  const cargar = () => {
    setLoading(true)
    setError(null)
    pedir(false)
  }

  useEffect(() => {
    const m = { vigente: true }
    montaje.current = m
    pedir(false)
    return () => {
      m.vigente = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [pedir])

  const abrir = (i: DesbloqueoItem) =>
    setDetalle({ id: i.convocatoriaId, codigo: i.codigo ?? String(i.convocatoriaId), titulo: i.titulo, entidad: i.entidad })

  /** El panel avisa cada cambio de estado: se refleja en la fila sin recargar toda la lista. */
  const alActualizar = useCallback((d: Desbloqueo) => {
    setItems((lista) =>
      lista.map((i) =>
        i.convocatoriaId === d.convocatoriaId
          ? { ...i, estadoAnalisis: d.estadoAnalisis ?? i.estadoAnalisis, veredicto: d.analisis?.veredicto ?? i.veredicto }
          : i,
      ),
    )
  }, [])

  return (
    <div className="min-h-full bg-canvas">
      <Topbar quota={quota} />

      <main className={`${container} flex flex-col gap-[22px] pt-6 pb-12 max-[720px]:pt-4`}>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px]">Mis desbloqueos</h1>
            <p className="mt-1.5 text-[14px] text-muted">
              Las licitaciones que desbloqueaste, con sus bases y la recomendación de la IA para tu empresa.
            </p>
          </div>
          <Link className={`${btnPrimary} max-[720px]:w-full`} to="/app/descubrimiento">
            Buscar licitaciones →
          </Link>
        </header>

        <section className="grid grid-cols-4 gap-4 max-[1100px]:grid-cols-2 max-[720px]:gap-2.5">
          <KpiCard
            label="Desbloqueos usados"
            value={cupo ? cupo.usados + ' de ' + cupo.limite : '—'}
            hint={cupo ? 'te quedan ' + cupo.disponibles : ''}
          />
          <KpiCard label="Siguen abiertas" value={abiertas.toString()} hint="aún puedes postular" valueColor="var(--color-success)" />
          <KpiCard label="Monto referencial" value={solesCompacto(montoTotal)} hint="suma de tus desbloqueadas" />
          <KpiCard label="Recomendadas" value={paraPostular.toString()} hint="la IA sugiere postular" />
        </section>

        {items.length ? (
          <section className={`${card} flex flex-wrap items-center justify-between gap-4 px-5 py-4`}>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar desbloqueos">
              {FILTROS.map((f) => (
                <button
                  key={f.valor}
                  type="button"
                  className={`rounded-full border px-3.5 py-[7px] text-[12.5px] font-semibold ${
                    filtro === f.valor ? 'border-primary bg-primary text-white' : 'border-line-strong bg-white text-muted'
                  }`}
                  onClick={() => setFiltro(f.valor)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 max-[720px]:basis-full">
              <label className="flex items-center gap-2 text-[13px] font-semibold text-muted">
                Fuente
                <select
                  className="rounded-sm border border-line bg-white px-2 py-[7px] text-[13px] font-semibold text-ink"
                  value={fuente}
                  onChange={(e) => setFuente(e.target.value)}
                >
                  <option value="">Todas</option>
                  {FUENTES.map((f) => (
                    <option key={f.valor} value={f.valor}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label
                className="flex flex-[0_1_320px] items-center gap-2 rounded-md border border-line-strong bg-white px-3 text-faint focus-within:border-primary focus-within:shadow-[0_0_0_3px_var(--color-primary-soft)] max-[720px]:basis-full"
                htmlFor="buscar-desbloqueos"
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
                  <path d="m11 11 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <input
                  id="buscar-desbloqueos"
                  className="min-w-0 flex-1 border-none bg-transparent py-2.5 text-[13.5px] text-ink outline-none"
                  type="search"
                  placeholder="Buscar por código, entidad o descripción"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
              </label>
            </div>
          </section>
        ) : null}

        {error ? (
          <div className={`${vacio} text-danger!`}>
            {error}
            <button className={btnSecondary} type="button" onClick={() => cargar()}>
              Reintentar
            </button>
          </div>
        ) : loading && !items.length ? (
          <p className={vacio}>Cargando tus desbloqueos…</p>
        ) : !items.length ? (
          <div className={`${card} ${vacio} flex-col! px-6! py-10!`}>
            <span className="text-[30px]" aria-hidden="true">
              🔓
            </span>
            <strong className="font-serif text-[20px] font-medium text-ink">Aún no desbloqueas licitaciones</strong>
            <p className="max-w-[460px] leading-normal">
              Tienes {cupo?.disponibles ?? 5} desbloqueos disponibles. Al desbloquear una licitación ves sus bases
              administrativas y el análisis ISO con IA para tu empresa.
            </p>
            <Link className={btnPrimary} to="/app/descubrimiento">
              Ir a Descubrimiento
            </Link>
          </div>
        ) : !visibles.length ? (
          <p className={vacio}>Ninguna licitación coincide con este filtro.</p>
        ) : (
          <section className={`${card} overflow-hidden`}>
            <div className={`${fila} items-center! bg-canvas text-[11px]! font-bold tracking-[0.04em] text-faint uppercase max-[1100px]:hidden`}>
              <span>Licitación</span>
              <span>Oportunidad</span>
              <span>Recomendación IA</span>
              <span>Acción</span>
            </div>
            {visibles.map((i) => {
              const c = cierre(i)
              return (
                <article key={i.convocatoriaId} className={fila}>
                  <div className="flex flex-col items-start gap-1.5">
                    <span className={`${mono} text-[12px] break-all text-muted`}>{i.codigo}</span>
                    <span
                      className="rounded-full border border-line px-[7px] py-px text-[10.5px] font-bold tracking-[0.03em] text-faint"
                      title={descripcionFuente(i.fuente)}
                    >
                      {etiquetaFuente(i.fuente)}
                    </span>
                    {i.abierta ? <span className={pillSuccess}>Abierta</span> : <span className={pillNeutral}>Cerrada</span>}
                    {c ? (
                      <span
                        className={
                          c.startsWith('Cierra hoy') || c.startsWith('Cierra mañana')
                            ? 'text-[12.5px] font-semibold text-warning'
                            : meta
                        }
                      >
                        {c}
                      </span>
                    ) : null}
                    <span className={meta}>Desbloqueada el {fecha(i.desbloqueadaEl)}</span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <strong className="leading-[1.4] font-semibold">{i.titulo}</strong>
                    <span className={meta}>{i.entidad}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className={pillNeutral}>{i.objeto}</span>
                      <span className={meta}>📍 {i.departamento}</span>
                      {i.valorReferencial > 0 ? (
                        <span className={meta}>
                          Valor referencial: <strong className="leading-[1.4] font-semibold">{soles(i.valorReferencial)}</strong>
                        </span>
                      ) : null}
                    </span>
                  </div>

                  <div>
                    {i.veredicto ? (
                      <span className={pillVeredicto(i.veredicto)}>{i.veredicto}</span>
                    ) : i.estadoAnalisis === 'procesando' || i.estadoAnalisis === 'pendiente' ? (
                      <span className="inline-flex items-center gap-2 text-[13px] text-muted">
                        <span className={spinner} /> Analizando…
                      </span>
                    ) : (
                      <span className={i.estadoAnalisis === 'error' ? pillDanger : pillNeutral}>{estadoAnalisisTexto(i)}</span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 max-[1100px]:flex-row max-[1100px]:flex-wrap max-[1100px]:items-center">
                    {i.basesUrl ? (
                      <a className={`${btnPrimary} ${filaBtn}`} href={i.basesUrl} target="_blank" rel="noopener noreferrer">
                        ⬇ Bases
                      </a>
                    ) : null}
                    <button className={`${btnSecondary} ${filaBtn}`} type="button" onClick={() => abrir(i)}>
                      Ver análisis
                    </button>
                    {i.fichaUrl ? (
                      <a
                        className="text-center text-[12.5px] font-semibold text-primary"
                        href={i.fichaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Ficha SEACE ↗
                      </a>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </section>
        )}
      </main>

      {detalle ? <DetalleDesbloqueo lic={detalle} onCerrar={() => setDetalle(null)} onActualizado={alActualizar} /> : null}
    </div>
  )
}
