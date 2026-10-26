import { useRef, useState } from 'react'
import { mensajeError, solicitarAsesoria } from '../lib/api'
import { btnPrimary, btnSecondary, dialogError } from '../lib/ui'

export function SolicitarAsesor({ licitacionId }: { licitacionId: number }) {
  const [confirmar, setConfirmar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  const solicitudId = useRef<string | null>(null)
  async function enviar() {
    setOcupado(true); setError('')
    solicitudId.current ??= crypto.randomUUID()
    try {
      const resultado = await solicitarAsesoria(solicitudId.current, licitacionId)
      setMensaje(resultado.mensaje); setConfirmar(false)
    } catch (err) {
      setError(mensajeError(err, 'No pudimos registrar la solicitud. Inténtalo nuevamente.'))
    } finally { setOcupado(false) }
  }
  return <section className="mt-5 flex flex-col gap-3 rounded-md border border-primary-line bg-primary-soft p-4" aria-label="Atención comercial">
    <h4 className="font-semibold">¿Necesitas ayuda con las certificaciones?</h4>
    {mensaje ? <p role="status">{mensaje}</p> : <>
      <p className="text-[13px] text-muted">Un asesor puede orientarte sobre esta licitación y las certificaciones para tu empresa.</p>
      {confirmar ? <>
        <p className="text-[13px]">Enviaremos al equipo comercial tu nombre, correo, empresa y la referencia de esta licitación. ¿Deseas solicitar el contacto?</p>
        <div className="flex flex-wrap gap-2"><button type="button" className={btnPrimary} disabled={ocupado} onClick={() => void enviar()}>{ocupado ? 'Enviando solicitud…' : 'Confirmar solicitud'}</button>
          <button type="button" className={btnSecondary} disabled={ocupado} onClick={() => { setConfirmar(false); setError('') }}>Cancelar</button></div>
      </> : <button type="button" className={btnPrimary} onClick={() => setConfirmar(true)}>Hablar con un asesor</button>}
      {error && <p role="alert" className={dialogError}>{error}</p>}
    </>}
  </section>
}
