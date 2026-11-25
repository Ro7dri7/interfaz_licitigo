import { useState } from 'react'
import * as api from '../lib/api'
import { mensajeError } from '../lib/api'
import { btnPrimary, btnSecondary, overlay } from '../lib/ui'

export const PLANES = [
  { id: 'free', nombre: 'Free', precio: 'S/ 0', creditos: '5 desbloqueos iniciales', pago: false, popular: false },
  { id: 'explorador', nombre: 'Explorador', precio: 'S/ 79.90', creditos: '30 desbloqueos', pago: true, popular: false },
  { id: 'comercial', nombre: 'Comercial', precio: 'S/ 189.90', creditos: '100 desbloqueos', pago: true, popular: true },
  { id: 'empresarial', nombre: 'Empresarial', precio: 'S/ 349.90', creditos: '250 desbloqueos', pago: true, popular: false },
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
    <div className={overlay} onClick={onCerrar}>
      <div
        className="w-full max-w-[920px] rounded-lg bg-white p-6 shadow-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="planes-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="planes-titulo" className="font-serif text-[28px] text-ink">Planes y precios</h2>
            <p className="mt-1 text-[14px] text-muted">Cada desbloqueo con IA usa 1 crédito. Los créditos se suman a tu saldo.</p>
          </div>
          <button className={btnSecondary} type="button" onClick={onCerrar}>Cerrar</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PLANES.map((plan) => {
            const actual = (planActual || 'free') === plan.id
            return (
              <article
                key={plan.id}
                className={`flex flex-col gap-3 rounded-md border p-4 ${plan.popular ? 'border-primary shadow-[0_0_0_3px_var(--color-primary-soft)]' : 'border-line'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[16px] font-semibold">{plan.nombre}</h3>
                  {plan.popular ? <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">Más popular</span> : null}
                </div>
                <p className="font-serif text-[26px] text-ink">{plan.precio}</p>
                <p className="text-[13.5px] text-muted">{plan.creditos}</p>
                {actual ? <span className="text-[12.5px] font-bold text-success">Plan actual</span> : <span className="text-[12.5px] text-transparent">.</span>}
                {plan.pago ? (
                  <button className={btnPrimary} type="button" disabled={cargando !== null} onClick={() => pagar(plan.id)}>
                    {cargando === plan.id ? 'Abriendo pago…' : 'Elegir plan'}
                  </button>
                ) : (
                  <button className={btnSecondary} type="button" disabled>Incluido al crear la cuenta</button>
                )}
              </article>
            )
          })}
        </div>
        {error ? <p className="mt-4 text-[13.5px] text-danger" role="alert">{error}</p> : null}
      </div>
    </div>
  )
}
