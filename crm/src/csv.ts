import { originLabel, origins } from './types'

// Lector CSV mínimo: comillas, comillas escapadas, saltos de línea dentro de un campo, BOM y separador coma o punto y coma.
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, ''), first = source.split(/\r?\n/, 1)[0]
  const delimiter = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char !== '"') cell += char
      else if (source[i + 1] === '"') { cell += '"'; i++ }
      else quoted = false
    } else if (char === '"') quoted = true
    else if (char === delimiter) { row.push(cell); cell = '' }
    else if (char === '\n' || char === '\r') { if (char === '\r' && source[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim()))
}

const MAX_ROWS = 200
const fields: Record<string, string> = { empresa: 'company', ruc: 'ruc', servicio: 'service', contacto: 'contact', correo: 'email', email: 'email', telefono: 'phone', responsable: 'owner', origen: 'origin', notas: 'notes' }
export const template = 'Empresa,RUC,Servicio,Contacto,Correo,Telefono,Responsable,Origen,Notas\r\nEmpresa Ejemplo SAC,20123456789,ISO 9001,Ana Torres,ana@ejemplo.com,+51 999 111 222,Sin asignar,Manual,Interesada en certificación inicial\r\n'
const plain = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()

export interface Row { line: number; payload: Record<string, string>; errors: string[] }

export function readDeals(text: string): { rows: Row[]; problem: string } {
  const [head, ...body] = parseCsv(text)
  if (!head) return { rows: [], problem: 'El archivo está vacío.' }
  const columns = head.map(h => fields[plain(h)] ?? '')
  if (!columns.includes('company') || !columns.includes('service')) return { rows: [], problem: 'La primera fila debe incluir las columnas Empresa y Servicio.' }
  if (body.length > MAX_ROWS) return { rows: [], problem: `Importa hasta ${MAX_ROWS} filas por archivo.` }
  return { problem: '', rows: body.map((cells, index) => {
    const payload: Record<string, string> = {}
    columns.forEach((field, i) => { if (field && cells[i]?.trim()) payload[field] = cells[i].trim() })
    const errors: string[] = []
    const origin = payload.origin ? origins.find(o => plain(o) === plain(payload.origin) || plain(originLabel(o)) === plain(payload.origin)) : 'Manual'
    if (!origin) errors.push(`Origen no válido: ${payload.origin}`)
    payload.origin = origin ?? ''
    if ((payload.company ?? '').length < 2) errors.push('Falta la empresa')
    if ((payload.service ?? '').length < 2) errors.push('Falta el servicio')
    if (payload.ruc && !/^\d{11}$/.test(payload.ruc)) errors.push('El RUC debe tener 11 dígitos')
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) errors.push('Correo no válido')
    if (payload.phone && !/^[+\d\s()-]{1,30}$/.test(payload.phone)) errors.push('Teléfono no válido')
    return { line: index + 2, payload: { ...payload, kind: 'quote' }, errors }
  }) }
}

