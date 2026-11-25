import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Sesion } from '../../types/models'
import { REGISTRO, panelDe } from './destino'

function Logo() {
  return (
    <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-blue to-brand-emerald text-white shadow-sm shadow-blue-500/30">
      <svg className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        <circle className="fill-current text-white" cx="12" cy="12" r="3" />
      </svg>
    </span>
  )
}

export function LandingNav({ sesion }: { sesion: Sesion | null }) {
  const [abierto, setAbierto] = useState(false)
  const cerrar = () => setAbierto(false)
  const enlace = 'text-sm font-semibold text-brand-subtle hover:text-brand-blue'
  const cta = 'inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-emerald to-brand-emerald-dark px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-500/20 sm:px-5 sm:py-2.5 sm:text-sm'

  return (
    <header className="fixed top-4 right-0 left-0 z-50 px-4 sm:px-6 lg:px-8">
      <nav className="glass-panel mx-auto flex max-w-7xl items-center justify-between rounded-full border border-brand-border/80 px-4 py-3 shadow-subtle sm:px-6">
        <div className="flex items-center gap-3">
          <a className="group flex items-center gap-2" href="#inicio" aria-label="LiciHub inicio">
            <span className="transition-transform group-hover:scale-105"><Logo /></span>
            <span className="text-xl font-extrabold tracking-tight text-brand-ink">Lici<span className="text-brand-blue">Hub</span></span>
          </a>
          <span className="hidden items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-100/90 px-2.5 py-1 text-xs font-semibold text-brand-slate sm:inline-flex">
            <svg className="h-3 w-3.5 overflow-hidden rounded-sm" viewBox="0 0 3 2" aria-hidden="true">
              <rect fill="#D91023" height="2" width="1" />
              <rect fill="#FFFFFF" height="2" width="1" x="1" />
              <rect fill="#D91023" height="2" width="1" x="2" />
            </svg>
            Perú • SEACE 3.0
          </span>
        </div>
        <div className="hidden items-center gap-8 text-sm font-semibold text-brand-subtle md:flex">
          <a className="hover:text-brand-blue" href="#como-funciona">Cómo funciona</a>
          <a className="flex items-center gap-1 hover:text-brand-blue" href="#ia-iso">
            IA + ISO
            <span className="rounded-full border border-blue-200/60 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-blue uppercase">Nuevo</span>
          </a>
          <a className="hover:text-brand-blue" href="#telegram">Bot Telegram</a>
          <a className="hover:text-brand-blue" href="#precios">Precios</a>
        </div>
        <div className="flex items-center gap-3">
          <Link className="hidden px-2 py-1 text-xs font-semibold text-brand-subtle hover:text-brand-ink lg:inline-flex" to="/comercial">Espacio comercial</Link>
          {sesion ? (
            <Link className={cta} to={panelDe(sesion)}>Ir a mi panel</Link>
          ) : (
            <>
              <Link className="px-2 py-1 text-sm font-semibold text-brand-slate hover:text-brand-blue" to="/ingresar">Entrar</Link>
              <Link className={cta} to={REGISTRO}>
                Empieza gratis
                <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
            </>
          )}
          <button className="inline-flex size-9 items-center justify-center rounded-full border border-brand-border md:hidden" type="button" aria-expanded={abierto} aria-label="Abrir menú" onClick={() => setAbierto((v) => !v)}>
            <span className="text-lg leading-none">{abierto ? '×' : '☰'}</span>
          </button>
        </div>
      </nav>
      {abierto ? (
        <div className="glass-panel mx-auto mt-2 flex max-w-7xl flex-col gap-3 rounded-3xl border border-brand-border p-4 text-sm font-semibold shadow-subtle md:hidden">
          <a className={enlace} href="#como-funciona" onClick={cerrar}>Cómo funciona</a>
          <a className={enlace} href="#ia-iso" onClick={cerrar}>IA + ISO</a>
          <a className={enlace} href="#telegram" onClick={cerrar}>Bot Telegram</a>
          <a className={enlace} href="#precios" onClick={cerrar}>Precios</a>
          <Link className={enlace} to="/comercial" onClick={cerrar}>Espacio comercial</Link>
          {sesion ? null : <Link className={enlace} to="/ingresar" onClick={cerrar}>Entrar</Link>}
        </div>
      ) : null}
    </header>
  )
}
