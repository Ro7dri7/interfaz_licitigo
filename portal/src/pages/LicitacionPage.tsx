import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DetalleDesbloqueo, type LicitacionResumen } from '../components/DetalleDesbloqueo'
import { PlanesModal } from '../components/PlanesModal'
import { Topbar } from '../components/Topbar'
import * as api from '../lib/api'
import { esSinCreditos, mensajeError } from '../lib/api'
import { btnPrimary, container } from '../lib/ui'
import { Dialogo } from '../components/Dialogo'
import type { Cupo, Desbloqueo } from '../types/models'

export function LicitacionPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const licState = (location.state as { lic?: LicitacionResumen; inicial?: Desbloqueo | null } | null)?.lic
  const inicial = (location.state as { inicial?: Desbloqueo | null } | null)?.inicial ?? null
  const volver = params.get('volver') || '/app/descubrimiento'
  const lic: LicitacionResumen = licState ?? {
    id: Number(id),
    codigo: id,
    titulo: 'Ficha de la licitación',
    entidad: 'Vuelve al listado si no ves el nombre de la entidad.',
    desbloqueada: true,
  }
  const [cupo, setCupo] = useState<Cupo | null>(null)
  const [planes, setPlanes] = useState(false)
  const [sinCreditos, setSinCreditos] = useState(false)
  const [desbloqueando, setDesbloqueando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<Desbloqueo | null>(inicial)

  useEffect(() => {
    let activo = true
    api.perfil().then((p) => {
      if (activo && p.desbloqueos) setCupo(p.desbloqueos)
    }).catch(() => {})
    return () => { activo = false }
  }, [])

  const desbloquear = () => {
    if (desbloqueando) return
    const saldo = cupo?.creditos ?? cupo?.disponibles ?? abierta?.creditos ?? abierta?.disponibles
    if (typeof saldo === 'number' && saldo <= 0) {
      setSinCreditos(true)
      return
    }
    setDesbloqueando(true)
    setError(null)
    api.desbloquear(lic.id).then((d) => {
      setDesbloqueando(false)
      setAbierta(d)
      setCupo({ usados: d.usados, limite: d.limite, disponibles: d.disponibles, creditos: d.creditos ?? d.disponibles, plan: d.plan })
    }).catch((err) => {
      setDesbloqueando(false)
      if (esSinCreditos(err)) {
        setSinCreditos(true)
        return
      }
      setError(mensajeError(err, 'No se pudo desbloquear la licitación.'))
    })
  }

  return (
    <div className="min-h-full bg-canvas">
      <Topbar creditos={cupo?.creditos ?? cupo?.disponibles ?? abierta?.creditos ?? null} onMejorar={() => setPlanes(true)} />
      <main id="main-content" tabIndex={-1} className={`${container} py-6 pb-12`}>
        {error ? <p className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-[13.5px] text-danger" role="alert">{error}</p> : null}
        <DetalleDesbloqueo
          key={abierta?.desbloqueada ? 'abierta' : 'bloqueada'}
          lic={{ ...lic, desbloqueada: abierta?.desbloqueada ?? lic.desbloqueada }}
          inicial={abierta}
          onCerrar={() => navigate(volver)}
          creditos={cupo?.creditos ?? null}
          onPlanes={() => setPlanes(true)}
          onDesbloquear={lic.desbloqueada || abierta?.desbloqueada ? undefined : desbloquear}
          desbloqueando={desbloqueando}
        />
      </main>
      {sinCreditos ? (
        <Dialogo className="w-full max-w-md rounded-2xl bg-white p-6 shadow-panel" tituloId="sin-creditos" onCerrar={() => setSinCreditos(false)}>
            <h2 id="sin-creditos" className="font-serif text-[26px]">Tus créditos se acabaron</h2>
            <p className="mt-2 text-[14px] text-muted">Ya no te quedan desbloqueos. Elige un plan para seguir viendo el análisis ISO.</p>
            <button className={`${btnPrimary} mt-5 w-full`} type="button" onClick={() => { setSinCreditos(false); setPlanes(true) }}>Ver planes</button>
        </Dialogo>
      ) : null}
      <PlanesModal abierto={planes} planActual={cupo?.plan} onCerrar={() => setPlanes(false)} />
    </div>
  )
}
