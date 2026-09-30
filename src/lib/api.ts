import { guardarSesion, logout, obtenerSesion, porVencer, refrescar } from './auth'
import type {
  Company,
  Cupo,
  Desbloqueo,
  DesbloqueoItem,
  Estadisticas,
  FiltrosLicitaciones,
  HistorialEmpresa,
  PaginaLicitaciones,
  Perfil,
  Sesion,
  TelegramEstado,
  TelegramLink,
  TerminoLicitado,
} from '../types/models'

/** Error HTTP del backend: `status` 0 = sin conexión; `detail` es el cuerpo `detail` de FastAPI. */
export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

interface Opciones {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  params?: URLSearchParams
  signal?: AbortSignal
}

async function enviar(path: string, o: Opciones, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {}
  if (o.body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const consulta = o.params?.toString()
  try {
    return await fetch(consulta ? `${path}?${consulta}` : path, {
      method: o.method ?? 'GET',
      headers,
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
      signal: o.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, null)
  }
}

async function leer<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let detail: unknown = null
    try {
      detail = ((await r.json()) as { detail?: unknown }).detail ?? null
    } catch {
      detail = null
    }
    throw new ApiError(r.status, detail)
  }
  return (await r.json()) as T
}

/**
 * Cliente del backend FastAPI (backend/). En desarrollo /api se redirige a :8000 con el proxy de Vite.
 * Agrega el access token a las llamadas a /api. Si está por vencer lo renueva antes; si el backend responde 401
 * intenta renovarlo una vez y repite la petición. Si tampoco se puede, cierra la sesión.
 */
async function request<T>(path: string, o: Opciones = {}): Promise<T> {
  const sesion = obtenerSesion()
  if (path.startsWith('/api/auth/') || !sesion) return leer<T>(await enviar(path, o, null))

  if (porVencer()) {
    let nueva: Sesion
    try {
      nueva = await refrescar()
    } catch (err) {
      logout()
      throw err
    }
    return leer<T>(await enviar(path, o, nueva.accessToken))
  }

  const r = await enviar(path, o, sesion.accessToken)
  if (r.status !== 401) return leer<T>(r)

  const original = new ApiError(401, null)
  let nueva: Sesion
  try {
    nueva = await refrescar()
  } catch {
    logout()
    throw original
  }
  const r2 = await enviar(path, o, nueva.accessToken)
  if (r2.status === 401) logout()
  return leer<T>(r2)
}

// ----------------------------------------------------------------------------- cuenta

export async function login(email: string, password: string): Promise<Sesion> {
  const s = await request<Sesion>('/api/auth/login', { method: 'POST', body: { email, password } })
  guardarSesion(s)
  return s
}

export async function registro(nombre: string, email: string, password: string): Promise<Sesion> {
  const s = await request<Sesion>('/api/auth/registro', { method: 'POST', body: { nombre, email, password } })
  guardarSesion(s)
  return s
}

// ----------------------------------------------------------------------------- empresa y perfil

export function empresa(ruc: string): Promise<Company> {
  return request<Company>(`/api/empresas/${ruc}`)
}

export function terminos(ciius: string[], ruc: string | null, limite = 12): Promise<TerminoLicitado[]> {
  const params = new URLSearchParams({ limite: String(limite) })
  if (ciius.length) params.set('ciius', ciius.join(','))
  if (ruc) params.set('ruc', ruc)
  return request<TerminoLicitado[]>('/api/terminos', { params })
}

export function conteoKeyword(keyword: string): Promise<{ keyword: string; abiertas: number }> {
  return request('/api/keywords/conteo', { params: new URLSearchParams({ keyword }) })
}

export function perfil(): Promise<Perfil> {
  return request<Perfil>('/api/perfil')
}

export function guardarPerfil(cambios: { nombre?: string; ruc?: string; keywords?: string[] }): Promise<Perfil> {
  return request<Perfil>('/api/perfil', { method: 'PUT', body: cambios })
}

/** Vuelve a consultar SUNAT y RNP para la empresa de la cuenta. */
export function actualizarEmpresa(): Promise<Perfil> {
  return request<Perfil>('/api/perfil/empresa/actualizar', { method: 'POST', body: {} })
}

export function historialEmpresa(): Promise<HistorialEmpresa> {
  return request<HistorialEmpresa>('/api/perfil/historial')
}

// ----------------------------------------------------------------------------- licitaciones

export function misDesbloqueos(): Promise<Cupo & { items: DesbloqueoItem[] }> {
  return request('/api/desbloqueos')
}

export function licitaciones(f: FiltrosLicitaciones, porPagina = 10, signal?: AbortSignal): Promise<PaginaLicitaciones> {
  const params = new URLSearchParams({
    pagina: String(f.pagina),
    por_pagina: String(porPagina),
    solo_perfil: String(f.soloPerfil),
    orden: f.orden,
  })
  for (const kw of f.keywords) params.append('keywords', kw)
  if (f.q.trim()) params.set('q', f.q.trim())
  if (f.departamento) params.set('departamento', f.departamento)
  if (f.objeto) params.set('objeto', f.objeto)
  if (f.fuente) params.set('fuente', f.fuente)
  if (f.keyword) params.set('keyword', f.keyword)
  return request<PaginaLicitaciones>('/api/licitaciones', { params, signal })
}

export function desbloquear(id: number): Promise<Desbloqueo> {
  return request<Desbloqueo>(`/api/licitaciones/${id}/desbloquear`, { method: 'POST', body: {} })
}

export function desbloqueo(id: number): Promise<Desbloqueo> {
  return request<Desbloqueo>(`/api/licitaciones/${id}/desbloqueo`)
}

export function reanalizar(id: number): Promise<Desbloqueo> {
  return request<Desbloqueo>(`/api/licitaciones/${id}/reanalizar`, { method: 'POST', body: {} })
}

export function estadisticas(): Promise<Estadisticas> {
  return request<Estadisticas>('/api/estadisticas')
}

// ----------------------------------------------------------------------------- Telegram

/** Enlace de un solo uso (24 h) para conectar Telegram a la cuenta; usa el RUC y las keywords de la cuenta. */
export function suscribirTelegram(): Promise<TelegramLink> {
  return request<TelegramLink>('/api/alertas/telegram', { method: 'POST', body: {} })
}

export function estadoTelegram(): Promise<TelegramEstado> {
  return request<TelegramEstado>('/api/alertas/telegram')
}

export function desconectarTelegram(): Promise<TelegramEstado> {
  return request<TelegramEstado>('/api/alertas/telegram', { method: 'DELETE' })
}

// ----------------------------------------------------------------------------- errores

export function mensajeError(err: unknown, porDefecto: string): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'No hay conexión con el servidor. Revisa tu internet o inténtalo en un momento.'
    const detail = err.detail
    if (typeof detail === 'string') return detail
    // Errores de validación de FastAPI: [{ msg, loc }]
    if (Array.isArray(detail) && typeof detail[0]?.msg === 'string') return traducir(detail[0].msg)
    if (err.status >= 500) return 'El servidor tuvo un problema. Inténtalo de nuevo en unos segundos.'
  }
  return porDefecto
}

function traducir(msg: string): string {
  if (/valid email/i.test(msg)) return 'Ingresa un correo válido.'
  if (/at least 8 characters/i.test(msg)) return 'La contraseña debe tener al menos 8 caracteres.'
  if (/at least 2 characters/i.test(msg)) return 'Escribe tu nombre.'
  return 'Revisa los datos ingresados.'
}

/** true si el error viene de cancelar la petición (el componente ya no la necesita). */
export function esCancelacion(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}
