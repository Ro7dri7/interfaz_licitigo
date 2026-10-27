import { dot, mono, pill } from '../lib/ui'

interface RadarCardProps {
  convocatorias?: string
  monto?: string
  convocatoriasLabel?: string
  montoLabel?: string
}

export function RadarCard({
  convocatorias = '1,420',
  monto = 'S/ 38.5M',
  convocatoriasLabel = 'Convocatorias Abiertas',
  montoLabel = 'Monto en Juego',
}: RadarCardProps) {
  return (
    <div className="rounded-lg border border-navy-line bg-[linear-gradient(165deg,var(--color-navy)_0%,var(--color-navy-soft)_100%)] px-[22px] py-5 text-white">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-[12px] font-bold tracking-[0.04em]">
          <span className={dot} style={{ background: '#22c55e' }} />
          RADAR SEACE 3.0 EN VIVO
        </span>
        <span className={`${pill} ${mono} border border-white/12 bg-white/8 text-[11px]! text-[#cbd5e1]`}>Hoy</span>
      </div>
      <p className="mb-4 text-[13px] text-[#94a3b8]">Oportunidades de contratación pública activas hoy en Perú:</p>
      <div className="flex gap-7">
        <div>
          <span className="mb-1 block text-[12px] text-[#94a3b8]">{convocatoriasLabel}</span>
          <strong className="text-[24px] font-bold">{convocatorias}</strong>
        </div>
        <div>
          <span className="mb-1 block text-[12px] text-[#94a3b8]">{montoLabel}</span>
          <strong className="text-[24px] font-bold text-[#34d399]">{monto}</strong>
        </div>
      </div>
    </div>
  )
}
