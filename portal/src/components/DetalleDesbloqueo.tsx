import { useEffect, useRef, useState } from 'react'
import * as api from '../lib/api'
import { mensajeError } from '../lib/api'
import { btnGhost, btnPrimary, btnSecondary, card, dialogError, mono, pillNeutral, pillSuccess, pillVeredicto, spinner } from '../lib/ui'
import type { Desbloqueo } from '../types/models'
import { SolicitarAsesor } from './SolicitarAsesor'

/** Datos mínimos de la licitación para el encabezado del panel. */
export interface LicitacionResumen {
  id: number
  codigo: string
  titulo: string
  entidad: string
  departamento?: string
  objeto?: string
  valorReferencial?: number
  desbloqueada?: boolean
  fichaUrl?: string | null
  basesUrl?: string | null
}

interface Props {
  lic: LicitacionResumen
  /** Respuesta que ya se tiene (p. ej. la del POST de desbloqueo), para no esperar la primera consulta. */
  inicial?: Desbloqueo | null
  onCerrar: () => void
  /** Cada vez que llega un estado nuevo (sirve para refrescar la lista del padre). */
  onActualizado?: (d: Desbloqueo) => void
  creditos?: number | null
  onPlanes?: () => void
  onDesbloquear?: () => void
  desbloqueando?: boolean
}

const POLL_MS = 4000
const POLL_MAX = 120 // ~8 minutos

const muted = 'text-[12.5px] text-muted'
const box = 'flex flex-col gap-1.5 rounded-2xl bg-canvas px-3.5 py-3 text-[13.5px] leading-6 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-[18px]'

/**
 * Panel lateral de una licitación desbloqueada: bases, documentos, ficha SEACE y el análisis ISO con IA.
 * Mientras n8n procesa, consulta el estado cada pocos segundos. Lo usan Descubrimiento y Mis desbloqueos.
 */
function Candado() {
  return <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
}

export function DetalleDesbloqueo({ lic, inicial = null, onCerrar, onActualizado, creditos = null, onPlanes, onDesbloquear, desbloqueando = false }: Props) {
  const [data, setData] = useState<Desbloqueo | null>(inicial?.desbloqueada ? inicial : null)
  const [error, setError] = useState<string | null>(null)
  const [reintentando, setReintentando] = useState(false)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Vigencia del montaje actual: las respuestas de un montaje anterior (StrictMode, cierre) se descartan. */
  const montaje = useRef({ vigente: false })
  const onActualizadoRef = useRef(onActualizado)
  useEffect(() => {
    onActualizadoRef.current = onActualizado
  }, [onActualizado])

  const recibir = (d: Desbloqueo) => {
    setData(d)
    onActualizadoRef.current?.(d)
  }

  /** Mientras n8n procesa, se vuelve a consultar cada pocos segundos. */
  const programar = (d: Desbloqueo | null, intento: number, m: { vigente: boolean }) => {
    if (timer.current) clearTimeout(timer.current)
    const estado = d?.estadoAnalisis
    if (m.vigente && (estado === 'procesando' || estado === 'pendiente') && intento < POLL_MAX) {
      timer.current = setTimeout(() => consultar(intento + 1, m), POLL_MS)
    }
  }

  const consultar = (intento: number, m: { vigente: boolean }) => {
    api
      .desbloqueo(lic.id)
      .then((d) => {
        if (!m.vigente) return
        setError(null)
        recibir(d)
        programar(d, intento, m)
      })
      .catch((err) => {
        if (m.vigente) setError(mensajeError(err, 'No se pudo consultar el análisis.'))
      })
  }

  useEffect(() => {
    const m = { vigente: true }
    montaje.current = m
    if (inicial?.desbloqueada) {
      programar(inicial, 0, m)
    } else {
      consultar(0, m)
    }
    return () => {
      m.vigente = false
      if (timer.current) clearTimeout(timer.current)
    }
    // Solo al abrir el panel de esta licitación
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [lic.id])

  const reanalizar = () => {
    if (reintentando) return
    setReintentando(true)
    setError(null)
    const m = montaje.current
    api
      .reanalizar(lic.id)
      .then((d) => {
        if (!m.vigente) return
        setReintentando(false)
        recibir(d)
        programar(d, 0, m)
      })
      .catch((err) => {
        setReintentando(false)
        setError(mensajeError(err, 'No se pudo reintentar el análisis.'))
      })
  }

  const abierta = data?.desbloqueada === true
  const saldo = data?.creditos ?? data?.disponibles ?? creditos
  const ficha = data?.fichaUrl || lic.fichaUrl
  const bases = data?.basesUrl || lic.basesUrl
  return (
    <article>
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button className={`${btnGhost} mb-3 px-0!`} type="button" onClick={onCerrar}>← Volver al listado</button>
          <p className="text-[11px] font-bold tracking-[0.08em] text-faint">FICHA DE LICITACIÓN</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {abierta ? <span className={pillSuccess}>Desbloqueada</span> : <span className={pillNeutral}>Bloqueada</span>}
            {lic.objeto ? <span className={pillNeutral}>{lic.objeto}</span> : null}
          </div>
          <h1 id="det-titulo" className={`${mono} mt-3 text-[28px] leading-tight`}>{lic.codigo}</h1>
          <p className="mt-2 text-[15px] text-muted">{lic.entidad}{lic.departamento ? ` · ${lic.departamento}` : ''}</p>
        </div>
        <div className="flex flex-col items-start gap-2 text-[13px] text-muted lg:items-end">
          {saldo !== null && saldo !== undefined ? <span>Te quedan {saldo} créditos</span> : null}
          {ficha ? <a className="font-semibold text-primary" href={ficha} target="_blank" rel="noopener noreferrer">Ver ficha en SEACE ↗</a> : null}
        </div>
      </header>
      {error ? <p className={dialogError} role="alert">{error}</p> : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.9fr)]">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Mini titulo="Entidad y departamento" valor={lic.entidad} detalle={lic.departamento || 'No especificado'} />
            <Mini titulo="Monto referencial" valor={lic.valorReferencial ? `S/ ${lic.valorReferencial.toLocaleString('es-PE')}` : 'No especificado'} />
            <Mini titulo="Objeto / tipo" valor={lic.objeto || 'No especificado'} />
          </div>
          <section className={`${card} p-5`}>
            <h2 className="mb-2 text-[16px] font-semibold">Descripción de la convocatoria</h2>
            <p className="text-[14.5px] leading-7 text-ink">{lic.titulo || 'Sin descripción publicada.'}</p>
          </section>
          <section className={`${card} p-5`}>
            <h2 className="mb-3 text-[16px] font-semibold">Análisis ISO con IA</h2>
            {data?.desbloqueada ? <Analisis data={data} reintentando={reintentando} onReanalizar={reanalizar} /> : data && data.desbloqueada === false ? (
              <div className="relative">
                <div className="pointer-events-none rounded-2xl border border-line bg-canvas p-4 blur-sm select-none" aria-hidden="true">
                  <strong>Postular</strong>
                  <p className="mt-2">ISO 9001:2015 · Encaje con tu actividad</p>
                  <p>Brecha: certificación pendiente</p>
                </div>
                {onDesbloquear ? (
                  <button className={`${btnPrimary} absolute inset-0 m-auto h-fit w-fit`} type="button" disabled={desbloqueando} onClick={onDesbloquear}>
                    <Candado /> {desbloqueando ? 'Desbloqueando…' : 'Desbloquear'}
                  </button>
                ) : null}
              </div>
            ) : <p className="text-muted">Cargando el análisis…</p>}
          </section>
        </div>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <section className={`${card} p-5`}>
            <h2 className="mb-3 text-[16px] font-semibold">Bases administrativas y SEACE</h2>
            {abierta && bases ? (
              <a className={`${btnSecondary} mb-3 w-full`} href={bases} target="_blank" rel="noopener noreferrer">Descargar bases</a>
            ) : <p className={`${muted} mb-3`}>El SEACE aún no publica el documento de bases.</p>}
            {ficha ? <a className={`${btnSecondary} w-full`} href={ficha} target="_blank" rel="noopener noreferrer">Ver ficha en SEACE ↗</a> : null}
            {data?.documentos?.length ? (
              <ul className="mt-3 flex flex-col gap-1.5 text-[13px] [&_a]:font-semibold [&_a]:text-primary">
                {data.documentos.map((doc) => <li key={doc.url}><a href={doc.url} target="_blank" rel="noopener noreferrer">{doc.nombre}</a></li>)}
              </ul>
            ) : null}
            {abierta && data ? <button className={`${btnGhost} mt-3 px-0!`} type="button" disabled={reintentando} onClick={reanalizar}>Reanalizar con tu RUC</button> : null}
          </section>
          {abierta ? <SolicitarAsesor key={lic.id} licitacionId={lic.id} /> : null}
          <section className={`${card} p-4 text-[13px] text-muted`}>
            <p>{saldo !== null && saldo !== undefined ? `Te quedan ${saldo} créditos.` : 'Créditos de desbloqueo.'}</p>
            {onPlanes ? <button className={`${btnGhost} mt-1 px-0! text-primary!`} type="button" onClick={onPlanes}>Recargar créditos</button> : null}
          </section>
        </aside>
      </div>
    </article>
  )
}

function Mini({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return <div className={`${card} p-4`}><p className="text-[11px] font-bold tracking-[0.05em] text-faint uppercase">{titulo}</p><p className="mt-2 text-[14px] font-semibold leading-snug">{valor}</p>{detalle ? <p className="mt-1 text-[12.5px] text-muted">{detalle}</p> : null}</div>
}

function Analisis({
  data,
  reintentando,
  onReanalizar,
}: {
  data: Desbloqueo
  reintentando: boolean
  onReanalizar: () => void
}) {
  const proceso = 'flex items-center gap-2.5 text-[14px] text-muted'
  switch (data.estadoAnalisis) {
    case 'procesando':
      return (
        <p className={proceso}>
          <span className={spinner} /> Leyendo las bases y analizando tu perfil… puede tardar 1–3 minutos.
        </p>
      )
    case 'pendiente':
      return (
        <p className={proceso}>
          <span className={spinner} /> En cola…
        </p>
      )
    case 'error':
      return (
        <>
          <p className={dialogError}>{data.error || 'El análisis falló.'}</p>
          <button className={btnSecondary} type="button" onClick={onReanalizar} disabled={reintentando}>
            Reintentar análisis (no gasta desbloqueos)
          </button>
        </>
      )
    case 'sin_analisis':
      return (
        <>
          <p className={muted}>{data.error || 'No se pudo analizar el documento de bases.'}</p>
          {data.analisisDisponible ? (
            <button className={btnSecondary} type="button" onClick={onReanalizar} disabled={reintentando}>
              Reintentar análisis
            </button>
          ) : null}
        </>
      )
    case 'listo': {
      const a = data.analisis
      if (!a) return <p className={muted}>El análisis terminó sin resultados para mostrar.</p>
      const r = a.requisitosIso
      return (
        <>
          {a.veredicto ? (
            <p>
              <span className={pillVeredicto(a.veredicto)}>{a.veredicto}</span>
            </p>
          ) : null}
          {a.resumen ? <p className="text-[14px] leading-[1.55]">{a.resumen}</p> : null}
          {r ? (
            <div className={box}>
              <strong>Lo que piden las bases</strong>
              <span>
                ISO: {r.estado || '—'}
                {r.modalidad ? ' · ' + r.modalidad : ''}
              </span>
              {r.normas.length ? <span>Normas: {r.normas.join(', ')}</span> : null}
              {r.resumen ? <span className={muted}>{r.resumen}</span> : null}
            </div>
          ) : null}
          {a.encaje ? (
            <p className="text-[14px] leading-[1.55]">
              <strong>Encaje con tu actividad:</strong> {a.encaje}
            </p>
          ) : null}
          {a.brechas.length ? (
            <div className={`${box} bg-warning-soft!`}>
              <strong>Brechas</strong>
              <ul>
                {a.brechas.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {a.isoRecomendadas.length ? (
            <div className={box}>
              <strong>ISO recomendadas para tu empresa</strong>
              <ul>
                {a.isoRecomendadas.map((iso) => (
                  <li key={iso.norma}>
                    <strong>{iso.norma}</strong>
                    {iso.alcance ? ' — ' + iso.alcance : ''}
                    <br />
                    <span className={muted}>{iso.motivo}</span>
                  </li>
                ))}
              </ul>
              {a.pack ? <span className={muted}>Disponible también como {a.pack}.</span> : null}
            </div>
          ) : null}
          {a.mensajeComercial ? <p className={muted}>{a.mensajeComercial}</p> : null}
        </>
      )
    }
    default:
      return null
  }
}
