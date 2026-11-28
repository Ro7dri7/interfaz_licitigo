import { PLANES } from './PlanesModal'
import { btnPrimary } from '../lib/ui'
import { Dialogo } from './Dialogo'

interface Props {
  abierto: boolean
  planId?: string | null
  creditos: number
  onCerrar: () => void
}

export function CompraExitosa({ abierto, planId, creditos, onCerrar }: Props) {
  if (!abierto) return null
  const plan = PLANES.find((p) => p.id === planId) ?? null
  const adquiridos = plan && plan.pago ? plan.creditos : null

  return (
    <Dialogo className="w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-panel" tituloId="compra-exito-titulo" onCerrar={onCerrar}>
        <div
          className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-success)_18%,white)] text-[28px] font-bold text-success"
          aria-hidden="true"
        >
          ✓
        </div>
        <h2 id="compra-exito-titulo" className="font-serif text-[26px] text-ink">
          Pago confirmado
        </h2>
        <p className="mt-2 text-[14px] text-muted">
          {plan
            ? `Adquiriste el plan ${plan.nombre}.`
            : 'Tu compra se acreditó correctamente.'}
        </p>
        <div className="mt-5 rounded-lg border border-line bg-canvas px-4 py-3 text-left text-[13.5px]">
          {plan ? (
            <p className="flex justify-between gap-3">
              <span className="text-muted">Plan</span>
              <strong>{plan.nombre}</strong>
            </p>
          ) : null}
          {adquiridos ? (
            <p className="mt-2 flex justify-between gap-3">
              <span className="text-muted">Créditos del paquete</span>
              <strong>+{adquiridos}</strong>
            </p>
          ) : null}
          <p className="mt-2 flex justify-between gap-3 border-t border-line pt-2">
            <span className="text-muted">Saldo disponible</span>
            <strong className="text-success">{creditos} créditos</strong>
          </p>
        </div>
        <button className={`${btnPrimary} mt-6 w-full`} type="button" onClick={onCerrar}>
          Seguir desbloqueando
        </button>
    </Dialogo>
  )
}
