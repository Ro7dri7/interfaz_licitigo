import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useOnboarding } from '../context/OnboardingContext'
import { analizarLicitacion, licitacion as fetchLicitacion, mensajeError } from '../lib/api'
import type { AnalisisIa, ConvocatoriaApi } from '../types/models'

function fechaLarga(iso: string | null): string {
  if (!iso) return 'Sin fecha'
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return iso
  return fecha.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })
}

function montoVisible(valor: string | null): string {
  const limpio = String(valor ?? '').replace(/[^\d.]/g, '')
  const numero = Number(limpio)
  if (!Number.isFinite(numero) || numero <= 0) return 'S/ —'
  return `S/ ${numero.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
}

function conGanador(etapa: string | null): boolean {
  return /otorgamiento de la buena pro|buena pro/i.test(etapa ?? '')
}

export function LicitacionDetailPage() {
  const params = useParams()
  const nomenclatura = decodeURIComponent(params['*'] ?? '').replace(/\/$/, '')
  const onboarding = useOnboarding()
  const [detalle, setDetalle] = useState<ConvocatoriaApi | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ruc, setRuc] = useState(onboarding.company?.ruc ?? '')
  const [analizando, setAnalizando] = useState(false)
  const [errorAnalisis, setErrorAnalisis] = useState<string | null>(null)
  const [analisis, setAnalisis] = useState<AnalisisIa | null>(null)

  useEffect(() => {
    if (!nomenclatura) return
    const controlador = new AbortController()
    setError(null)
    fetchLicitacion(nomenclatura)
      .then((respuesta) => {
        if (!controlador.signal.aborted) setDetalle(respuesta)
      })
      .catch((err: unknown) => {
        if (!controlador.signal.aborted) setError(mensajeError(err, 'No se pudo abrir esta licitación.'))
      })
    return () => controlador.abort()
  }, [nomenclatura])

  const analizar = async () => {
    const documento = ruc.trim()
    if (!documento || !nomenclatura) return
    setAnalizando(true)
    setErrorAnalisis(null)
    setAnalisis(null)
    try {
      setAnalisis(await analizarLicitacion({ licitacion: nomenclatura, ruc: documento }))
    } catch (err: unknown) {
      setErrorAnalisis(mensajeError(err, 'n8n no devolvió el análisis.'))
    } finally {
      setAnalizando(false)
    }
  }

  const etapa = detalle?.etapa_seace || detalle?.estado || 'Sin etapa'
  const ganador = conGanador(detalle?.etapa_seace ?? null)

  return (
    <div className="min-h-full bg-slate-50/70 font-[Plus_Jakarta_Sans,Inter,sans-serif] text-slate-800">
      <main className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8">
        <Link className="text-xs font-bold text-blue-600 hover:underline" to="/app/descubrimiento">
          ← Volver al listado
        </Link>

        {error ? <p className="mt-6 text-sm text-red-600">{error}</p> : null}
        {!detalle && !error ? <p className="mt-6 text-sm text-slate-500">Cargando convocatoria…</p> : null}

        {detalle ? (
          <>
            <header className="mt-4 flex flex-col gap-3 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-extrabold tracking-wider text-blue-600 uppercase">Ficha de licitación</p>
                <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
                  {detalle.nomenclatura || detalle.nomenclatura_norm}
                </h1>
                <p className="mt-1 font-mono text-xs text-slate-500">{detalle.nomenclatura_norm}</p>
              </div>
              <span
                className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${
                  ganador ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {ganador ? 'Con ganador' : 'En proceso'}
                <span className="ml-2 font-medium opacity-80">{etapa}</span>
              </span>
            </header>

            <div className="mt-6 grid items-start gap-6 lg:grid-cols-5">
              <section className="space-y-4 lg:col-span-3">
                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-xs font-extrabold tracking-wider text-slate-400 uppercase">Entidad</h2>
                  <p className="mt-1 text-lg font-bold text-slate-900">{detalle.entidad || 'Sin entidad'}</p>
                  <p className="mt-1 text-xs text-slate-500">{detalle.departamento}</p>
                </article>

                <div className="grid gap-4 sm:grid-cols-2">
                  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-xs font-extrabold tracking-wider text-slate-400 uppercase">Monto referencial</h2>
                    <p className="mt-1 font-mono text-xl font-bold text-slate-900">{montoVisible(detalle.monto)}</p>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-xs font-extrabold tracking-wider text-slate-400 uppercase">Objeto</h2>
                    <p className="mt-1 text-lg font-bold text-slate-900">{detalle.objeto || '—'}</p>
                  </article>
                </div>

                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-xs font-extrabold tracking-wider text-slate-400 uppercase">Descripción</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{detalle.descripcion || 'Sin descripción'}</p>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="mb-4 text-xs font-extrabold tracking-wider text-slate-400 uppercase">Cronograma</h2>
                  <ol className="space-y-4 border-l-2 border-blue-100 pl-4">
                    <li>
                      <p className="text-xs font-bold text-blue-600">Publicación</p>
                      <p className="text-sm font-semibold text-slate-800">{fechaLarga(detalle.fecha_publicacion)}</p>
                    </li>
                    <li>
                      <p className="text-xs font-bold text-blue-600">Integración de bases</p>
                      <p className="text-sm font-semibold text-slate-800">{fechaLarga(detalle.fecha_integracion)}</p>
                    </li>
                    <li>
                      <p className="text-xs font-bold text-blue-600">Presentación de propuestas</p>
                      <p className="text-sm font-semibold text-slate-800">{fechaLarga(detalle.fecha_presentacion)}</p>
                    </li>
                  </ol>
                </article>
              </section>

              <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
                <h2 className="text-sm font-extrabold text-slate-900">Panel de inteligencia</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Lici lee las bases y contrasta el RUC con SUNAT a través de n8n.
                </p>
                <label className="mt-4 block text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                  RUC
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm font-semibold text-slate-800 outline-none focus:border-blue-400"
                    inputMode="numeric"
                    value={ruc}
                    onChange={(event) => setRuc(event.target.value)}
                  />
                </label>
                <button
                  className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-300"
                  type="button"
                  disabled={analizando || !ruc.trim()}
                  onClick={() => void analizar()}
                >
                  {analizando ? 'Cargando... (Procesando IA)' : 'Analizar bases con Lici IA'}
                </button>
                {analizando ? (
                  <p className="mt-3 text-sm text-slate-500">Cargando… (Leyendo PDFs y consultando SUNAT)</p>
                ) : null}
                {errorAnalisis ? <p className="mt-3 text-sm text-red-600">{errorAnalisis}</p> : null}

                {analisis ? (
                  <div className="mt-5 space-y-4">
                    <div
                      className={`rounded-xl border p-4 ${
                        analisis.postular === false
                          ? 'border-red-200 bg-red-50'
                          : analisis.postular
                            ? 'border-emerald-200 bg-emerald-50'
                            : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <p className="text-[11px] font-extrabold tracking-wider text-slate-500 uppercase">Recomendación</p>
                      <p className="mt-1 text-lg font-extrabold text-slate-900">{analisis.recomendacion}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-extrabold tracking-wider text-slate-400 uppercase">ISO requeridas</p>
                      <Lista items={analisis.isosRequeridas} vacio="n8n no indicó normas obligatorias." />
                    </div>
                    <div>
                      <p className="text-[11px] font-extrabold tracking-wider text-slate-400 uppercase">ISO recomendadas</p>
                      <Lista items={analisis.isosRecomendadas} vacio="Sin normas sugeridas." />
                    </div>
                    <div>
                      <p className="text-[11px] font-extrabold tracking-wider text-slate-400 uppercase">Encaje de actividad (CIIU)</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">{analisis.encaje || 'Sin evaluación de CIIU.'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-extrabold tracking-wider text-slate-400 uppercase">Brechas</p>
                      <Lista items={analisis.brechas} vacio="No se reportaron brechas." />
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}

function Lista({ items, vacio }: { items: string[]; vacio: string }) {
  if (!items.length) return <p className="mt-1 text-sm text-slate-500">{vacio}</p>
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((item) => (
        <li key={item} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {item}
        </li>
      ))}
    </ul>
  )
}
