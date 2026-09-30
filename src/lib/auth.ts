import { useSyncExternalStore } from 'react'
import type { Sesion } from '../types/models'

const STORAGE_KEY = 'lici.sesion'

/** Sesión de la cuenta (Supabase Auth a través del backend). Se guarda en localStorage. */
let sesion: Sesion | null = leer()
const oyentes = new Set<() => void>()
let refrescando: Promise<Sesion> | null = null
let navegar: ((ruta: string) => void) | null = null
/** La sesión terminó porque la persona salió (no por entrar a una ruta sin cuenta). */
let cierreExplicito = false

function leer(): Sesion | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const s = raw ? (JSON.parse(raw) as Sesion) : null
    return s?.accessToken && s.refreshToken && s.usuario ? s : null
  } catch {
    return null
  }
}

function emitir(): void {
  oyentes.forEach((fn) => fn())
}

export function obtenerSesion(): Sesion | null {
  return sesion
}

export function guardarSesion(s: Sesion): void {
  sesion = s
  cierreExplicito = false
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* sin almacenamiento: la sesión dura lo que la pestaña */
  }
  emitir()
}

/** El router registra aquí cómo navegar, para poder salir a /ingresar desde fuera de React. */
export function registrarNavegador(fn: ((ruta: string) => void) | null): void {
  navegar = fn
}

export function logout(redirigir = true): void {
  sesion = null
  cierreExplicito = redirigir
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem('lici.onboarding')
  } catch {
    /* sin almacenamiento */
  }
  emitir()
  if (redirigir) navegar?.('/ingresar')
}

/** true si la última sesión se cerró con «Salir» (el guard manda a /ingresar sin ?volver=). */
export function salioExplicitamente(): boolean {
  return cierreExplicito
}

/** Ya en /ingresar, las próximas rutas sin cuenta vuelven a recordar a dónde se quería ir. */
export function olvidarCierre(): void {
  cierreExplicito = false
}

/** true si el token vence en menos de un minuto. */
export function porVencer(): boolean {
  return !!sesion && sesion.expiresAt * 1000 - Date.now() < 60_000
}

/** Renueva el access token. Las peticiones que lleguen a la vez comparten una sola renovación. */
export function refrescar(): Promise<Sesion> {
  const actual = sesion
  if (!actual) return Promise.reject(new Error('Sin sesión'))
  refrescando ??= fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: actual.refreshToken }),
  })
    .then(async (r) => {
      if (!r.ok) throw new Error(`refresh ${r.status}`)
      const nueva = (await r.json()) as Sesion
      guardarSesion(nueva)
      return nueva
    })
    .finally(() => {
      refrescando = null
    })
  return refrescando
}

function suscribir(fn: () => void): () => void {
  oyentes.add(fn)
  return () => oyentes.delete(fn)
}

export function useSesion(): Sesion | null {
  return useSyncExternalStore(suscribir, obtenerSesion)
}

/** Primer nombre (o el correo) para el saludo y la inicial del avatar. */
export function nombreCorto(s: Sesion | null): string {
  const u = s?.usuario
  return (u?.nombre || u?.email || '').trim().split(/\s+/)[0] ?? ''
}
