import { useMemo, useState } from 'react'
import { currentScale } from '../../../shared/a11y'
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
  if (cantidad <= 0 || maximo <= 0) return 'var(--lh-map-empty, #E2E8F0)'
  const t = cantidad / maximo
  if (t >= 0.85) return '#10B981'
  if (t >= 0.55) return '#1D4ED8'
  if (t >= 0.28) return '#3B82F6'
  return '#93C5FD'
}

/** Coordenadas del puntero en px de CSS: con la escala de fuente (zoom en body) no coinciden con las de pantalla. */
function punto(id: string, x: number, y: number) {
  const escala = currentScale()
  return { id, x: x / escala, y: y / escala }
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
      <svg className="h-auto w-full" viewBox={peruMapa.viewBox} role="group" aria-label="Mapa del Perú por departamento. Usa Tab para recorrer los departamentos y Enter para filtrar.">
        {peruMapa.departamentos.map((dep) => {
          const cantidad = porDep.get(dep.id)?.cantidad ?? 0
          const elegido = seleccionado === dep.id
          return (
            <path
              key={dep.id}
              d={dep.d}
              fill={colorDe(cantidad, maximo)}
              stroke={elegido ? 'var(--lh-map-selected, #0F172A)' : 'var(--lh-map-stroke, #ffffff)'}
              strokeWidth={elegido ? 2.4 : 1}
              className="cursor-pointer transition-opacity hover:opacity-80"
              role="button"
              tabIndex={0}
              aria-pressed={elegido}
              aria-label={`${nombreDe(dep.id)}: ${cantidad.toLocaleString('es-PE')} licitaciones activas`}
              onMouseEnter={(e) => setHover(punto(dep.id, e.clientX, e.clientY))}
              onMouseMove={(e) => setHover(punto(dep.id, e.clientX, e.clientY))}
              onMouseLeave={() => setHover(null)}
              onFocus={(e) => {
                const caja = e.currentTarget.getBoundingClientRect()
                setHover(punto(dep.id, caja.right, caja.top))
              }}
              onBlur={() => setHover(null)}
              onClick={() => onSelectDepartamento?.(dep.id)}
            >
              <title>{nombreDe(dep.id)}</title>
            </path>
          )
        })}
      </svg>
      {hover ? (
        <div
          className="pointer-events-none fixed z-50 w-52 rounded-2xl border border-line bg-white px-3 py-2 text-left shadow-lg"
          role="status"
          aria-live="polite"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <div className="text-sm font-bold text-ink">{nombreDe(hover.id)}</div>
          <div className="mt-1 text-xs text-muted">{(activo?.cantidad ?? 0).toLocaleString('es-PE')} licitaciones activas</div>
          <div className="text-xs font-semibold text-ink">Monto referencial {soles(activo?.monto_total ?? 0)}</div>
        </div>
      ) : null}
    </div>
  )
}
