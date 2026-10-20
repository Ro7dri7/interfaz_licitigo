export type Stage = 'new' | 'contacted' | 'qualified' | 'quoted' | 'followup' | 'won' | 'lost'
export const stages: { id: Stage; name: string; color: string }[] = [
  { id: 'new', name: 'Nuevo', color: '#64748b' }, { id: 'contacted', name: 'Contactado', color: '#0891b2' },
  { id: 'qualified', name: 'Necesidad validada', color: '#2f5bea' }, { id: 'quoted', name: 'Cotización enviada', color: '#b45309' },
  { id: 'followup', name: 'Seguimiento', color: '#7c3aed' }, { id: 'won', name: 'Ganado', color: '#15803d' },
  { id: 'lost', name: 'Perdido', color: '#dc2626' },
]
export const origins = ['Lici', 'WhatsApp', 'Referido', 'Campaña', 'Manual', 'Partner']
export const kindLabels = { signal: 'Señal LiciHub', advice: 'Asesoría solicitada', quote: 'Cotización solicitada', manual: 'Prospecto manual' }
export const evidenceLabels = { required: 'Requisito ISO detectado', recommended: 'ISO recomendada', pending: 'Análisis pendiente', none: 'Sin análisis asociado' }
export interface Company { id: string; name: string; ruc: string; origin: string; createdAt: string }
export interface Contact { id: string; companyId: string; name: string; email: string; phone: string }
export interface Prospect {
  id: string; companyId: string; contactId: string | null; kind: keyof typeof kindLabels; origin: string; service: string;
  owner: string; evidence: keyof typeof evidenceLabels; tender: string; deadline: string | null; notes: string;
  createdAt: string; dealId: string | null;
}
export interface Deal {
  id: string; companyId: string; contactId: string | null; service: string; origin: string; owner: string;
  stage: Stage; amount: number; createdAt: string; updatedAt: string; closedAt: string | null; lossReason: string; prospectIds: string[];
}
export interface Task { id: string; dealId: string; title: string; dueAt: string; done: boolean; completedAt: string | null }
export interface Activity { id: string; dealId: string; kind: string; text: string; actor: string; createdAt: string }
export interface Product { id: string; name: string; price: number; currency: string; active: boolean; sku?: string; category?: string; isPackage?: boolean; sourceRow?: number }
export interface Quote {
  id: string; dealId: string; number: string; version: number; productName: string; unitPrice: number; quantity: number;
  subtotal: number; discountPercent: number; discountAmount: number; taxPercent: number; taxAmount: number; total: number;
  status: 'draft'; validUntil: string; terms: string; createdAt: string;
}
export interface Data { companies: Company[]; contacts: Contact[]; prospects: Prospect[]; deals: Deal[]; tasks: Task[]; activities: Activity[]; products: Product[]; quotes: Quote[] }
export interface Snapshot { revision: number; data: Data }
export interface Session { mode: 'demo' | 'supabase'; user: { name: string; role: 'admin' | 'commercial' }; advisors?: string[]; isoCatalogSize?: number }
export const money = (cents: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 2 }).format(cents / 100)
export const dateLabel = (value: string) => new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: 'America/Lima' }).format(new Date(value.length === 10 ? value + 'T12:00:00-05:00' : value))
export const dateTime = (value: string) => new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' }).format(new Date(value))
export const initials = (value: string) => value.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()
export const openDeal = (d: Deal) => d.stage !== 'won' && d.stage !== 'lost'

// Keep the persisted/API origin stable while displaying the current product name.
export const originLabel = (value: string) => value === 'Lici' ? 'LiciHub' : value
