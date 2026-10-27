/** Origen de cada licitación en la base (columna convocatorias.fuente). */
export const FUENTES = [
  { valor: 'OECE', label: 'OECE', descripcion: 'Contrataciones abiertas del OECE' },
  { valor: 'PROD2', label: 'SEACE (PROD2)', descripcion: 'Buscador del SEACE (prod2)' },
  { valor: 'PROD6', label: 'PROD6', descripcion: 'Nuevo SEACE (prod6)' },
] as const

export function etiquetaFuente(fuente: string | null | undefined): string {
  return FUENTES.find((f) => f.valor === fuente)?.label ?? fuente ?? '—'
}

export function descripcionFuente(fuente: string | null | undefined): string {
  return FUENTES.find((f) => f.valor === fuente)?.descripcion ?? ''
}
