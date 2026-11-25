import { useMemo, useState } from 'react'
import { peruMapa } from './peruMapa'

export interface DatoDepartamento {
  departamento: string
  cantidad: number
  monto_total: number
}

const NOMBRES: Record<string, string> = {
  ANCASH: 'Áncash',
  APURIMAC: 'Apurímac',
  HUANUCO: 'Huánuco',
  JUNIN: 'Junín',
  'SAN MARTIN': 'San Martín',
}

function nombreDe(id: string): string {
  if (NOMBRES[id]) return NOMBRES[id]
  return id.toLowerCase().replace(/(^|\s)\S/g, (letra) => letra.toUpperCase())
}

function colorDe(cantidad: number, maximo: number): string {
  if (cantidad <= 0 || maximo <= 0) return '#E2E8F0'
  const t = cantidad / maximo
  if (t >= 0.85) return '#10B981'
  if (t >= 0.55) return '#1D4ED8'
  if (t >= 0.28) return '#3B82F6'
  return '#93C5FD'
}

function soles(monto: number): string {
  return monto.toLocaleString('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 })
}

export function PeruMap({
  datos,
  seleccionado,
  onSelectDepartamento,
}: {
  datos: DatoDepartamento[]
  seleccionado?: string
  onSelectDepartamento?: (departamento: string) => void
}) {
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const porDep = useMemo(() => {
    const mapa = new Map<string, DatoDepartamento>()
    for (const dato of datos) {
      if (dato.departamento !== 'OTROS') mapa.set(dato.departamento, dato)
    }
    return mapa
  }, [datos])
  const maximo = Math.max(0, ...[...porDep.values()].map((d) => d.cantidad))
  const activo = hover ? porDep.get(hover.id) : undefined

  return (
    <div className="relative w-full">
      <svg className="h-auto w-full" viewBox={peruMapa.viewBox} role="img" aria-label="Mapa del Perú por departamento">
        {peruMapa.departamentos.map((dep) => {
          const cantidad = porDep.get(dep.id)?.cantidad ?? 0
          const elegido = seleccionado === dep.id
          return (
            <path
              key={dep.id}
              d={dep.d}
              fill={colorDe(cantidad, maximo)}
              stroke={elegido ? '#0F172A' : '#ffffff'}
              strokeWidth={elegido ? 2.4 : 1}
              className="cursor-pointer transition-opacity hover:opacity-80"
              onMouseEnter={(e) => setHover({ id: dep.id, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => setHover({ id: dep.id, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelectDepartamento?.(dep.id)}
            >
              <title>{nombreDe(dep.id)}</title>
            </path>
          )
        })}
      </svg>
      {hover ? (
        <div
          className="pointer-events-none fixed z-50 w-52 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left shadow-lg"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <div className="text-sm font-bold text-slate-900">{nombreDe(hover.id)}</div>
          <div className="mt-1 text-xs text-slate-600">{(activo?.cantidad ?? 0).toLocaleString('es-PE')} licitaciones activas</div>
          <div className="text-xs font-semibold text-slate-800">Monto referencial {soles(activo?.monto_total ?? 0)}</div>
        </div>
      ) : null}
    </div>
  )
}
