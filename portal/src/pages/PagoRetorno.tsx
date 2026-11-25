import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as api from '../lib/api'
import { mensajeError } from '../lib/api'

/** Retorno de Stripe Checkout: acredita el pago y vuelve a Descubrimiento sin query params. */
export function PagoRetorno() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [texto, setTexto] = useState('Confirmando el pago…')

  useEffect(() => {
    const pago = params.get('pago')
    const sessionId = params.get('session_id')
    let vigente = true
    const ir = (state: { pago: string; creditos?: number; mensaje: string }) => {
      if (vigente) navigate('/app/descubrimiento', { replace: true, state })
    }
    if (pago === 'exito' && sessionId) {
      setTexto('Confirmando el pago…')
      api
        .verificarPago(sessionId)
        .then((r) => ir({ pago: 'exito', creditos: r.creditos, mensaje: `Pago acreditado. Ahora tienes ${r.creditos} créditos.` }))
        .catch((err) => ir({ pago: 'error', mensaje: mensajeError(err, 'No se pudo confirmar el pago. Si se cobró, recarga en unos segundos.') }))
    } else if (pago === 'cancelado') {
      setTexto('Volviendo al portal…')
      ir({ pago: 'cancelado', mensaje: 'El pago se canceló. Tu saldo no cambió.' })
    } else {
      ir({ pago: '', mensaje: '' })
    }
    return () => {
      vigente = false
    }
  }, [navigate, params])

  return <p className="p-8 text-[14px] text-muted">{texto || 'Volviendo al portal…'}</p>
}
