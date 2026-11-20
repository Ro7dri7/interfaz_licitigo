import { origins, originLabel, openDeal, priorityLabels, propertyEntityLabels, stages } from './types'
import type { Contact, Data, Deal, Quote } from './types'
import { limaDay } from './utils'

// Filtro personalizado del panel: un campo del CRM (propio o una propiedad creada por el admin) y su valor.
export interface Cond { field: string; value: string; to?: string }
export interface FieldDef { id: string; label: string; kind: 'select' | 'text' | 'number' | 'date'; options: [string, string][] }
export const propField = (id: string) => `prop:${id}`

export function fieldDefs(data: Data): FieldDef[] {
  const owners = [...new Set(data.deals.map(d => d.owner))].sort((a, b) => a.localeCompare(b, 'es'))
  return [
    { id: 'origen', label: 'Origen', kind: 'select', options: origins.map(o => [o, originLabel(o)]) },
    { id: 'etapa', label: 'Etapa', kind: 'select', options: stages.map(s => [s.id, s.name]) },
    { id: 'responsable', label: 'Responsable', kind: 'select', options: owners.map(o => [o, o]) },
    { id: 'prioridad', label: 'Prioridad', kind: 'select', options: Object.entries(priorityLabels) },
    ...data.properties.filter(p => p.active).map((p): FieldDef => ({ id: propField(p.id), label: `${p.name} (${propertyEntityLabels[p.entity].toLocaleLowerCase()})`, kind: p.type, options: p.options.map(o => [o, o]) })),
  ]
}

export const contactOf = (data: Data, deal: Deal): Contact | undefined => data.contacts.find(c => c.id === deal.contactId) ?? data.contacts.find(c => c.companyId === deal.companyId)

// Valor de un campo para un negocio; las propiedades de empresa o contacto se leen desde su registro.
export function valueOf(data: Data, deal: Deal, field: string): string {
  if (field === 'origen') return deal.origin
  if (field === 'etapa') return deal.stage
  if (field === 'responsable') return deal.owner
  if (field === 'prioridad') return deal.priority ?? 'normal'
  const prop = data.properties.find(p => propField(p.id) === field)
  if (!prop) return ''
  const record = prop.entity === 'deal' ? deal : prop.entity === 'company' ? data.companies.find(c => c.id === deal.companyId) : contactOf(data, deal)
  return record?.props?.[prop.id] ?? ''
}

export function matches(data: Data, deal: Deal, cond: Cond, defs: FieldDef[]): boolean {
  const def = defs.find(d => d.id === cond.field)
  if (!def || (!cond.value && !cond.to)) return true
  const value = valueOf(data, deal, cond.field)
  if (def.kind === 'select') return !cond.value || value === cond.value
  if (def.kind === 'text') return value.toLocaleLowerCase().includes(cond.value.toLocaleLowerCase())
  if (!value) return false
  if (def.kind === 'number') return (!cond.value || Number(value) >= Number(cond.value)) && (!cond.to || Number(value) <= Number(cond.to))
  return (!cond.value || value >= cond.value) && (!cond.to || value <= cond.to)
}

export type Preset = 'todo' | 'hoy' | '7d' | '30d' | 'mes' | 'anio' | 'custom'
export const presets: [Preset, string][] = [['todo', 'Todo el tiempo'], ['hoy', 'Hoy'], ['7d', '7 días'], ['30d', '30 días'], ['mes', 'Este mes'], ['anio', 'Este año']]
const DAY = 86_400_000
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10)

export function rangeFor(preset: Preset, now: number, desde: string, hasta: string) {
  const today = limaDay(now)
  if (preset === 'hoy') return { from: today, to: today }
  if (preset === '7d') return { from: addDays(today, -6), to: today }
  if (preset === '30d') return { from: addDays(today, -29), to: today }
  if (preset === 'mes') return { from: `${today.slice(0, 7)}-01`, to: today }
  if (preset === 'anio') return { from: `${today.slice(0, 4)}-01-01`, to: today }
  if (preset === 'custom') return { from: desde, to: hasta }
  return { from: '', to: '' }
}

export function summarize(data: Data, conds: Cond[], range: { from: string; to: string }) {
  const defs = fieldDefs(data), inRange = (iso: string | null) => Boolean(iso) && (!range.from || limaDay(iso!) >= range.from) && (!range.to || limaDay(iso!) <= range.to)
  const passing = data.deals.filter(d => conds.every(c => matches(data, d, c, defs)))
  const passIds = new Set(passing.map(d => d.id))
  // La fecha se aplica a la creación del negocio y de la cotización; lo vendido, a la fecha de cierre.
  const deals = passing.filter(d => inRange(d.createdAt)), won = passing.filter(d => d.stage === 'won' && inRange(d.closedAt))
  const quotes = data.quotes.filter(q => passIds.has(q.dealId) && inRange(q.createdAt))
  return { defs, deals, won, quotes, open: deals.filter(openDeal) }
}

// Cotización vendida: aceptada, o la última versión de un negocio ganado.
export function soldQuotes(data: Data, quotes: Quote[]): Quote[] {
  const latest = new Map<string, string>(), wonIds = new Set(data.deals.filter(d => d.stage === 'won').map(d => d.id))
  for (const q of data.quotes) latest.set(q.dealId, q.id)
  return quotes.filter(q => q.status === 'accepted' || (wonIds.has(q.dealId) && latest.get(q.dealId) === q.id))
}

export function rankProducts(quotes: Quote[]) {
  const totals = new Map<string, { name: string; amount: number; quantity: number }>()
  for (const q of quotes) for (const item of q.items) {
    const row = totals.get(item.productName) ?? { name: item.productName, amount: 0, quantity: 0 }
    row.amount += item.unitPrice * item.quantity; row.quantity += item.quantity; totals.set(item.productName, row)
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount || b.quantity - a.quantity)
}

export function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
  return counts
}

type Unit = 'day' | 'week' | 'month'
const weekStart = (day: string) => addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7))
const bucketKey = (day: string, unit: Unit) => unit === 'day' ? day : unit === 'week' ? weekStart(day) : day.slice(0, 7)
const nextKey = (key: string, unit: Unit) => unit === 'day' ? addDays(key, 1) : unit === 'week' ? addDays(key, 7) : (() => { const d = new Date(`${key}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7) })()
const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const labelOf = (key: string, unit: Unit) => unit === 'month' ? `${months[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}` : `${key.slice(8, 10)}/${key.slice(5, 7)}`

// Serie temporal con la misma escala para todas las líneas: por día, semana o mes según la duración.
export function timeline(series: Record<string, string[]>, range: { from: string; to: string }, today: string) {
  const all = Object.values(series).flat().map(limaDay).sort(), end = range.to || today
  // Sin rango definido y con pocos días de datos, se muestra al menos la última semana para que la línea se lea.
  const first = range.from || all[0] || today, start = range.from || Date.parse(end) - Date.parse(first) >= 6 * DAY ? first : addDays(end, -6)
  const span = Math.max(0, (Date.parse(end) - Date.parse(start)) / DAY), unit: Unit = span <= 31 ? 'day' : span <= 180 ? 'week' : 'month'
  const keys: string[] = []
  for (let key = bucketKey(start, unit); key <= bucketKey(end, unit) && keys.length < 400; key = nextKey(key, unit)) keys.push(key)
  const values = Object.fromEntries(Object.entries(series).map(([name, dates]) => {
    const counts = countBy(dates.map(limaDay).filter(d => d >= start && d <= end), d => bucketKey(d, unit))
    return [name, keys.map(k => counts.get(k) ?? 0)]
  }))
  return { labels: keys.map(k => labelOf(k, unit)), values, unit }
}
