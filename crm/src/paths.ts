// Vacío en el CRM aislado. El shell unificado define VITE_CRM_BASE=/comercial.
export const CRM_BASE = (import.meta.env.VITE_CRM_BASE ?? '').replace(/\/$/, '')

/** Prefija una ruta interna del CRM cuando la interfaz vive bajo /comercial. */
export function crmPath(path: string) {
  if (!path || /^(https?:|mailto:|tel:)/.test(path)) return path
  const hashAt = path.indexOf('#')
  const hash = hashAt >= 0 ? path.slice(hashAt) : ''
  const beforeHash = hashAt >= 0 ? path.slice(0, hashAt) : path
  const queryAt = beforeHash.indexOf('?')
  const query = queryAt >= 0 ? beforeHash.slice(queryAt) : ''
  const pathname = (queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash) || '/'
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`
  if (!CRM_BASE || normalized === CRM_BASE || normalized.startsWith(`${CRM_BASE}/`)) return `${normalized}${query}${hash}`
  return `${normalized === '/' ? CRM_BASE : CRM_BASE + normalized}${query}${hash}`
}
