/** S/ 12,345 */
export function soles(value: number): string {
  return 'S/ ' + (value || 0).toLocaleString('es-PE', { maximumFractionDigits: 0 })
}

/** S/ 1.5M a partir del millón; debajo, igual que `soles`. */
export function solesCompacto(value: number): string {
  if (value >= 1_000_000) return 'S/ ' + (value / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 1 }) + 'M'
  return soles(value)
}
