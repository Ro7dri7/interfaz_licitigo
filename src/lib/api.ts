import type { AnalisisIa, Company, ConvocatoriaApi, Estadisticas, PaginaLicitaciones, TelegramLink, TerminoLicitado } from '../types/models'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    throw new ApiError(0, 'No hay conexión con el backend. ¿Está corriendo en el puerto 8000?')
  }

  if (!response.ok) {
    let detail = ''
    try {
      const body = (await response.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      detail = ''
    }
    throw new ApiError(response.status, detail)
  }

  return (await response.json()) as T
}

export function mensajeError(err: unknown, porDefecto: string): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message
    if (err.message) return err.message
  }
  return porDefecto
}

export function empresa(ruc: string): Promise<Company> {
  return request<Company>(`/api/empresas/${ruc}`)
}

export function terminos(ciius: string[], limite = 10): Promise<TerminoLicitado[]> {
  const params = new URLSearchParams({ ciius: ciius.join(','), limite: String(limite) })
  return request<TerminoLicitado[]>(`/api/terminos?${params}`)
}

export function licitaciones(params: URLSearchParams): Promise<PaginaLicitaciones> {
  const consulta = params.toString()
  return request<PaginaLicitaciones>(`/api/licitaciones${consulta ? `?${consulta}` : ''}`)
}

export function licitacion(nomenclatura: string): Promise<ConvocatoriaApi> {
  return request<ConvocatoriaApi>(`/api/licitaciones/${encodeURI(nomenclatura)}`)
}

function texto(valor: unknown): string {
  if (typeof valor === 'string') return valor.trim()
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor)
  return ''
}

function lista(valor: unknown): string[] {
  if (Array.isArray(valor)) {
    return valor
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item === 'object') {
          const fila = item as Record<string, unknown>
          return texto(fila.nombre ?? fila.norma ?? fila.iso ?? fila.descripcion ?? fila.detalle ?? fila.texto)
        }
        return texto(item)
      })
      .filter(Boolean)
  }
  const plano = texto(valor)
  if (!plano) return []
  return plano
    .split(/\n|•/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
}

function bloqueRecomendacion(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  const raiz = payload as Record<string, unknown>
  const anidado = raiz.recomendacion
  if (anidado && typeof anidado === 'object' && !Array.isArray(anidado)) {
    return anidado as Record<string, unknown>
  }
  return raiz
}

export function interpretarAnalisis(payload: unknown): AnalisisIa {
  const bloque = bloqueRecomendacion(payload)
  const recomendacion = texto(bloque.recomendacion)
  const encaje = texto(bloque.encaje_actividad)
  const brechas = lista(bloque.brechas)
  const isosRecomendadas = lista(bloque.iso_recomendadas)
  const isosRequeridas = lista(bloque.iso_requeridas)
  const normalizada = recomendacion.toLowerCase()
  const postular = normalizada
    ? /no\s+recomend|no\s+postul|desaconsej/.test(normalizada)
      ? false
      : /postular/.test(normalizada)
        ? true
        : null
    : null
  return { recomendacion: recomendacion || 'Sin recomendación', postular, isosRequeridas, isosRecomendadas, encaje, brechas }
}

export async function analizarLicitacion(body: { licitacion: string; ruc: string }): Promise<AnalisisIa> {
  const payload = await request<unknown>('/api/analizar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return interpretarAnalisis(payload)
}

export function estadisticas(): Promise<Estadisticas> {
  return request<Estadisticas>('/api/estadisticas')
}

export function suscribirTelegram(body: {
  ruc: string | null
  razonSocial: string | null
  keywords: string[]
  ciius: string[]
}): Promise<TelegramLink> {
  return request<TelegramLink>('/api/alertas/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
