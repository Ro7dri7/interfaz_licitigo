export const limaDay = (value: string | number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(value))
// Entre comillas y con prefijo si parece una fórmula, para que una hoja de cálculo no ejecute texto de un cliente.
export const csvCell = (value: string | number) => { const text = String(value); return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"` }
export const whatsappNumber = (phone: string) => { const digits = phone.replace(/\D/g, ''); return digits.length === 9 ? `51${digits}` : digits.length >= 8 ? digits : '' }
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a')
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}

/**
 * Responsables para filtros y formularios: el equipo habilitado más quienes ya tienen negocios
 * (incluidos los nombres de integraciones), sin «Sin asignar», ordenados. `extra` asegura que
 * el valor elegido siempre tenga su opción en la lista.
 */
export function ownerOptions(advisors: string[] | undefined, deals: { owner: string }[], ...extra: string[]) {
  return [...new Set([...(advisors ?? []), ...deals.map(d => d.owner), ...extra])]
    .filter(name => name && name !== 'Sin asignar').sort((a, b) => a.localeCompare(b, 'es'))
}
