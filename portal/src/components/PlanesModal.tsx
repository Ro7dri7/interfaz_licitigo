import { useState } from 'react'
import * as api from '../lib/api'
import { mensajeError } from '../lib/api'
import { btnPrimary, btnSecondary } from '../lib/ui'
import { Dialogo } from './Dialogo'

export const PLANES = [
  {
    id: 'free',
    nombre: 'Free',
    detalle: 'Para empezar hoy',
    precio: 'S/ 0',
    unidad: '/ mes',
    creditos: '5',
    nota: 'Vigencia permanente',
    items: ['Búsqueda por RUC y RNP', 'Match de licitaciones SEACE', 'Acceso al bot de Telegram', 'Registro rápido con Google'],
    pago: false,
    popular: false,
    cta: 'Incluido al crear la cuenta',
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
    pago: true,
    popular: false,
    cta: 'Elegir Explorador',
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
    pago: true,
    popular: true,
    cta: 'Elegir Comercial',
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
    pago: true,
    popular: false,
    cta: 'Elegir Empresarial',
  },
] as const

interface Props {
  abierto: boolean
  planActual?: string | null
  onCerrar: () => void
}

export function PlanesModal({ abierto, planActual = 'free', onCerrar }: Props) {
  const [cargando, setCargando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!abierto) return null

  const pagar = (planId: string) => {
    if (cargando) return
    setCargando(planId)
    setError(null)
    api
      .checkout(planId)
      .then(({ checkout_url }) => {
        window.location.assign(checkout_url)
      })
      .catch((err) => {
        setCargando(null)
        setError(mensajeError(err, 'No se pudo abrir el pago.'))
      })
  }

  return (
    <Dialogo className="max-h-[92vh] w-full max-w-[1100px] overflow-y-auto rounded-lg bg-white p-6 shadow-panel" tituloId="planes-titulo" onCerrar={onCerrar}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="planes-titulo" className="font-serif text-[28px] text-ink">Planes y precios</h2>
            <p className="mt-1 text-[14px] text-muted">Cada desbloqueo con IA usa 1 crédito. Los créditos se suman a tu saldo.</p>
          </div>
          <button className={btnSecondary} type="button" onClick={onCerrar}>Cerrar</button>
        </div>
        <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANES.map((plan) => {
            const actual = (planActual || 'free') === plan.id
            return (
              <article
                key={plan.id}
                className={`relative flex flex-col justify-between rounded-xl border p-5 ${
                  plan.popular ? 'border-primary shadow-[0_0_0_3px_var(--color-primary-soft)]' : 'border-line'
                }`}
              >
                {plan.popular ? (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-white">
                    Más popular
                  </span>
                ) : null}
                <div>
                  <h3 className="text-[16px] font-semibold">{plan.nombre}</h3>
                  <p className="mt-0.5 text-[12.5px] text-muted">{plan.detalle}</p>
                  <p className="mt-3 font-serif text-[28px] text-ink">
                    {plan.precio}
                    <span className="ml-1 text-[12px] font-sans text-muted">{plan.unidad}</span>
                  </p>
                  <div className="mt-3 rounded-md border border-line bg-canvas px-3 py-2.5">
                    <p className="text-[13.5px] font-semibold text-ink">
                      <span className="text-primary">{plan.creditos}</span> créditos de desbloqueo
                    </p>
                    <p className="text-[12px] text-muted">{plan.nota}</p>
                  </div>
                  <ul className="mt-3 space-y-2 text-[12.5px] text-muted">
                    {plan.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="font-bold text-success" aria-hidden="true">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  {actual ? <p className="mt-3 text-[12.5px] font-bold text-success">Plan actual</p> : null}
                </div>
                {plan.pago ? (
                  <button className={`${btnPrimary} mt-5 w-full`} type="button" disabled={cargando !== null} onClick={() => pagar(plan.id)}>
                    {cargando === plan.id ? 'Abriendo pago…' : plan.cta}
                  </button>
                ) : (
                  <button className={`${btnSecondary} mt-5 w-full`} type="button" disabled>
                    {plan.cta}
                  </button>
                )}
              </article>
            )
          })}
        </div>
        <p className="mt-5 text-center text-[12.5px] text-muted">Pagos protegidos con Stripe · Visa / Mastercard · PEN</p>
        {error ? <p className="mt-3 text-[13.5px] text-danger" role="alert">{error}</p> : null}
    </Dialogo>
  )
}
