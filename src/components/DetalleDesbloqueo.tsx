import { useEffect, useRef, useState } from 'react'
import * as api from '../lib/api'
import { mensajeError } from '../lib/api'
import { btnPrimary, btnSecondary, dialogError, mono, overlay, pillSuccess, pillVeredicto, spinner } from '../lib/ui'
import type { Desbloqueo } from '../types/models'
import { SolicitarAsesor } from './SolicitarAsesor'

/** Datos mínimos de la licitación para el encabezado del panel. */
export interface LicitacionResumen {
  id: number
  codigo: string
  titulo: string
  entidad: string
}

interface Props {
  lic: LicitacionResumen
  /** Respuesta que ya se tiene (p. ej. la del POST de desbloqueo), para no esperar la primera consulta. */
  inicial?: Desbloqueo | null
  onCerrar: () => void
  /** Cada vez que llega un estado nuevo (sirve para refrescar la lista del padre). */
  onActualizado?: (d: Desbloqueo) => void
}

const POLL_MS = 4000
const POLL_MAX = 120 // ~8 minutos

const muted = 'text-[12.5px] text-muted'
const box = 'flex flex-col gap-1.5 rounded-md bg-canvas px-3.5 py-3 text-[13.5px] [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-[18px]'
const sec =
  'mt-[22px] flex flex-col gap-2.5 border-t border-line pt-[18px] [&_h4]:font-sans [&_h4]:text-[12px] [&_h4]:font-bold [&_h4]:tracking-[0.05em] [&_h4]:text-faint [&_h4]:uppercase'

/**
 * Panel lateral de una licitación desbloqueada: bases, documentos, ficha SEACE y el análisis ISO con IA.
 * Mientras n8n procesa, consulta el estado cada pocos segundos. Lo usan Descubrimiento y Mis desbloqueos.
 */
export function DetalleDesbloqueo({ lic, inicial = null, onCerrar, onActualizado }: Props) {
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

  return (
    <div className={`${overlay} items-stretch! justify-end! p-0!`} onClick={onCerrar}>
      <aside
        className="h-full w-full max-w-[520px] overflow-y-auto bg-white p-6 shadow-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="det-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <span className={pillSuccess}>Desbloqueada</span>
            <h3 id="det-titulo" className={`${mono} mt-2 text-[16px]`}>
              {lic.codigo}
            </h3>
          </div>
          <button
            className="size-[34px] shrink-0 rounded-full border-none bg-canvas text-[13.33px] text-black"
            type="button"
            aria-label="Cerrar"
            onClick={onCerrar}
          >
            ✕
          </button>
        </header>
        <p className="mt-3 leading-[1.45] font-semibold">{lic.titulo}</p>
        <p className="mt-1 text-[13px] text-muted">{lic.entidad}</p>

        {error ? (
          <p className={dialogError} role="alert">
            {error}
          </p>
        ) : null}

        {data ? (
          <>
            <section className={sec}>
              <h4>Bases administrativas</h4>
              <div className="flex flex-wrap gap-2.5">
                {data.basesUrl ? (
                  <a className={btnPrimary} href={data.basesUrl} target="_blank" rel="noopener noreferrer">
                    ⬇ Descargar bases
                  </a>
                ) : (
                  <span className={muted}>El SEACE aún no publica el documento de bases.</span>
                )}
                {data.fichaUrl ? (
                  <a className={btnSecondary} href={data.fichaUrl} target="_blank" rel="noopener noreferrer">
                    Ver ficha en SEACE
                  </a>
                ) : null}
              </div>
              {data.documentos?.length ? (
                <ul className="flex flex-col gap-1.5 text-[13px] [&_a]:font-semibold [&_a]:text-primary">
                  {data.documentos.map((doc) => (
                    <li key={doc.url}>
                      <a href={doc.url} target="_blank" rel="noopener noreferrer">
                        📄 {doc.nombre}
                      </a>{' '}
                      <span className={muted}>{doc.archivo}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className={sec}>
              <h4>Análisis ISO con IA</h4>
              <Analisis data={data} reintentando={reintentando} onReanalizar={reanalizar} />
            </section>
            {data.desbloqueada && <SolicitarAsesor key={lic.id} licitacionId={lic.id} />}
            <p className={`${muted} mt-[22px]`}>
              Te quedan {data.disponibles} de {data.limite} desbloqueos.
            </p>
          </>
        ) : (
          <p className="mt-5 text-muted">Cargando…</p>
        )}
      </aside>
    </div>
  )
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
