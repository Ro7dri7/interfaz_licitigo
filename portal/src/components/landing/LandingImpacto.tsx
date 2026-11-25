import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PeruMap } from '../PeruMap'
import { resumenDepartamentos, type ResumenDepartamentos } from '../../lib/api'
import { useSesion } from '../../lib/auth'
import { esCliente, registroConPlan } from './destino'

function compacto(monto: number): string {
  if (monto >= 1_000_000) return `S/ ${(monto / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 1 })}M`
  return `S/ ${monto.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
}

const colores = ['bg-blue-600', 'bg-blue-500', 'bg-brand-emerald', 'bg-teal-500', 'bg-slate-400']

export function LandingImpacto() {
  const navigate = useNavigate()
  const sesion = useSesion()
  const [resumen, setResumen] = useState<ResumenDepartamentos | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let activo = true
    resumenDepartamentos()
      .then((data) => {
        if (activo) setResumen(data)
      })
      .catch(() => {
        if (activo) setError(true)
      })
    return () => {
      activo = false
    }
  }, [])

  const top = (resumen?.departamentos ?? []).filter((d) => d.departamento !== 'OTROS').slice(0, 5)
  const maximo = top[0]?.monto_total || 1
  const elegir = (dep: string) => {
    if (esCliente(sesion)) navigate(`/app/descubrimiento?departamento=${encodeURIComponent(dep)}`)
    else navigate(registroConPlan())
  }

  return (
    <section className="border-t border-brand-border bg-white py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold tracking-wider text-brand-emerald-dark uppercase">Impacto Nacional</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-brand-ink sm:text-4xl lg:text-5xl">Visualiza todas las compras públicas del país</h2>
          <p className="mt-4 text-base text-brand-subtle sm:text-lg">Monitoreo unificado de los 25 departamentos del Perú con los montos referenciales de las convocatorias abiertas.</p>
        </div>
        <div className="rounded-3xl border border-brand-border bg-brand-bg p-6 shadow-subtle sm:p-10">
          <div className="grid grid-cols-2 gap-4 border-b border-slate-200/80 pb-8 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/60 bg-white p-5">
              <span className="text-xs font-semibold text-brand-subtle uppercase">Licitaciones Activas</span>
              <div className="mt-1 text-2xl font-extrabold text-brand-ink sm:text-3xl">{resumen ? resumen.total_licitaciones.toLocaleString('es-PE') : '…'}</div>
              <div className="mt-1 text-[11px] font-bold text-brand-blue">SEACE 3.0 al día</div>
            </div>
            <div className="rounded-2xl border border-slate-200/60 bg-white p-5">
              <span className="text-xs font-semibold text-brand-subtle uppercase">Inversión en Curso</span>
              <div className="mt-1 text-2xl font-extrabold text-brand-emerald-dark sm:text-3xl">{resumen ? compacto(resumen.inversion_total) : '…'}</div>
              <div className="mt-1 text-[11px] font-bold text-brand-emerald">Monto referencial abierto</div>
            </div>
            <div className="rounded-2xl border border-slate-200/60 bg-white p-5">
              <span className="text-xs font-semibold text-brand-subtle uppercase">Tiempo de Análisis</span>
              <div className="mt-1 text-2xl font-extrabold text-brand-ink sm:text-3xl">&lt; 10 seg</div>
              <div className="mt-1 text-[11px] font-bold text-slate-500">Motor IA en paralelo</div>
            </div>
            <div className="rounded-2xl border border-slate-200/60 bg-white p-5">
              <span className="text-xs font-semibold text-brand-subtle uppercase">Normas ISO Mapeadas</span>
              <div className="mt-1 text-2xl font-extrabold text-brand-blue sm:text-3xl">6 Normas</div>
              <div className="mt-1 text-[11px] font-bold text-blue-600">9001, 14001, 37001, 45001+</div>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
            <div className="rounded-2xl border border-slate-200/60 bg-white p-6 lg:col-span-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-bold tracking-wide text-brand-ink uppercase">Distribución Territorial</span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">{resumen ? 'Datos en vivo' : 'Cargando'}</span>
              </div>
              <PeruMap datos={resumen?.departamentos ?? []} onSelectDepartamento={elegir} />
              <p className="mt-2 text-center text-xs text-brand-subtle">
                {error ? 'No pudimos leer el resumen. El mapa sigue disponible.' : 'Elige un departamento para ver sus licitaciones.'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/60 bg-white p-6 sm:p-7 lg:col-span-7">
              <h3 className="mb-6 flex items-center justify-between text-sm font-bold text-brand-ink"><span>Top 5 Departamentos con más convocatorias</span><span className="text-xs font-normal text-brand-subtle">Convocatorias abiertas</span></h3>
              <div className="space-y-5">
                {top.length ? top.map((dep, i) => (
                  <button key={dep.departamento} type="button" className="block w-full text-left" onClick={() => elegir(dep.departamento)}>
                    <div className="mb-1.5 flex justify-between text-xs font-semibold text-brand-ink">
                      <span>{dep.departamento} · {dep.cantidad.toLocaleString('es-PE')}</span>
                      <span className="font-mono font-bold">{compacto(dep.monto_total)}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${colores[i]}`} style={{ width: `${Math.max(8, (dep.monto_total / maximo) * 100)}%` }} />
                    </div>
                  </button>
                )) : (
                  <p className="text-sm text-brand-subtle">{error ? 'Sin datos de departamentos por ahora.' : 'Calculando el ranking…'}</p>
                )}
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-brand-subtle">
                <span>Criterio: convocatorias abiertas en SEACE</span>
                <a className="font-bold text-brand-blue hover:underline" href="#como-funciona">Ver cómo funciona →</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
