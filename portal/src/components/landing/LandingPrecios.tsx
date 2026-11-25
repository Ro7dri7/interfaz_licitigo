import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkout } from '../../lib/api'
import type { Sesion } from '../../types/models'
import { esCliente, registroConPlan } from './destino'

const planes = [
  {
    id: 'free',
    nombre: 'Free',
    detalle: 'Para empezar hoy',
    precio: 'S/ 0',
    unidad: '/ mes',
    creditos: '5',
    nota: 'Vigencia permanente',
    items: ['Búsqueda por RUC y RNP', 'Match de licitaciones SEACE', 'Acceso al bot de Telegram', 'Registro rápido con Google'],
    cta: 'Empieza gratis',
  },
  {
    id: 'explorador',
    nombre: 'Explorador',
    detalle: 'Paquete único para proveedores',
    precio: 'S/ 79.90',
    unidad: '/ paquete',
    creditos: '30',
    nota: 'S/ 2.66 por licitación',
    items: ['Análisis IA de documentos SEACE', 'Recomendación ISO por licitación', 'Historial permanente de desbloqueos', 'Soporte vía Telegram'],
    cta: 'Adquirir Explorador',
  },
  {
    id: 'comercial',
    nombre: 'Comercial',
    detalle: 'Para contratistas frecuentes',
    precio: 'S/ 189.90',
    unidad: '/ paquete',
    creditos: '100',
    nota: 'S/ 1.89 por licitación',
    items: ['Todo lo del plan Explorador', 'Detección de Packs ISO de mayor puntaje', 'Derivación prioritaria al equipo comercial', 'Ideal para postulaciones frecuentes'],
    cta: 'Adquirir Comercial →',
    destacado: true,
  },
  {
    id: 'empresarial',
    nombre: 'Empresarial',
    detalle: 'Consorcios y constructoras',
    precio: 'S/ 349.90',
    unidad: '/ paquete',
    creditos: '250',
    nota: 'S/ 1.39 por licitación',
    items: ['Todo lo del plan Comercial', 'Cobertura multi-rubro y nacional', 'Asesoría dedicada en certificaciones ISO', 'Soporte comercial prioritario'],
    cta: 'Adquirir Empresarial',
  },
] as const

export function LandingPrecios({ sesion }: { sesion: Sesion | null }) {
  const navigate = useNavigate()
  const [ocupado, setOcupado] = useState('')
  const [error, setError] = useState('')

  const elegir = async (id: string) => {
    if (id === 'free' || !esCliente(sesion)) {
      navigate(id === 'free' ? registroConPlan() : registroConPlan(id))
      return
    }
    setError('')
    setOcupado(id)
    try {
      const pago = await checkout(id)
      window.location.assign(pago.checkout_url)
    } catch (err) {
      setOcupado('')
      setError(err instanceof Error ? err.message : 'No pudimos abrir el pago.')
    }
  }

  return (
    <section className="relative overflow-hidden bg-brand-bg py-24" id="precios">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-extrabold tracking-wider text-brand-blue uppercase">Planes flexibles por créditos</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-brand-ink sm:text-4xl lg:text-5xl">Empieza gratis y recarga créditos cuando escales.</h2>
          <p className="mt-4 text-base text-brand-subtle sm:text-lg">Cada desbloqueo te entrega el análisis completo con IA y recomendación ISO. Pago seguro con Stripe.</p>
        </div>
        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 lg:grid-cols-4">
          {planes.map((plan) => (
            <article key={plan.id} className={`relative flex flex-col justify-between rounded-3xl bg-white p-7 ${'destacado' in plan && plan.destacado ? 'border-2 border-brand-blue shadow-card-hover' : 'border border-brand-border shadow-subtle'}`}>
              {'destacado' in plan && plan.destacado ? <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-blue to-brand-emerald px-4 py-1 text-[11px] font-extrabold tracking-wide text-white uppercase">Más popular</span> : null}
              <div>
                <h3 className="text-xl font-bold text-brand-ink">{plan.nombre}</h3>
                <p className="mt-1 text-xs text-brand-subtle">{plan.detalle}</p>
                <div className="mt-6 mb-6"><span className="text-4xl font-extrabold text-brand-ink">{plan.precio}</span><span className="text-xs text-brand-subtle"> {plan.unidad}</span></div>
                <div className="mb-6 rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
                  <div className="text-sm font-bold text-brand-ink"><span className="font-extrabold text-brand-blue">{plan.creditos}</span> créditos de desbloqueo</div>
                  <div className="mt-0.5 text-xs text-brand-subtle">{plan.nota}</div>
                </div>
                <ul className="space-y-3 text-xs text-slate-600">
                  {plan.items.map((item) => <li key={item} className="flex gap-2"><span className="font-bold text-brand-emerald">✓</span><span>{item}</span></li>)}
                </ul>
              </div>
              <button className={`mt-8 w-full rounded-xl px-4 py-3 text-xs font-bold ${'destacado' in plan && plan.destacado ? 'bg-gradient-to-r from-brand-blue to-brand-emerald py-3.5 font-extrabold text-white' : 'border border-brand-border text-brand-ink hover:bg-slate-50'}`} type="button" disabled={ocupado === plan.id} onClick={() => void elegir(plan.id)}>
                {ocupado === plan.id ? 'Abriendo pago…' : plan.cta}
              </button>
            </article>
          ))}
        </div>
        {error ? <p className="mt-4 text-center text-sm text-red-600">{error}</p> : null}
        <div className="mx-auto mt-12 flex max-w-2xl flex-col items-center justify-between gap-3 rounded-2xl border border-brand-border bg-white p-4 text-xs text-brand-subtle sm:flex-row">
          <span>Pagos protegidos con cifrado SSL de 256 bits</span>
          <span className="font-semibold text-brand-slate">Stripe • Visa / Mastercard • Pago seguro en PEN</span>
        </div>
      </div>
    </section>
  )
}
