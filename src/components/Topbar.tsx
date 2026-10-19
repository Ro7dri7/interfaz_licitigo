import { NavLink } from 'react-router-dom'
import { logout, nombreCorto, useSesion } from '../lib/auth'
import { dot, pillNeutral, pillPrimary } from '../lib/ui'

interface TopbarProps {
  /** Desbloqueos usados / límite, p. ej. "2/5". */
  quota?: string
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[14px] font-semibold transition-[background,color] duration-150 max-[1180px]:whitespace-nowrap ${
    isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-canvas hover:text-ink'
  }`

export function Topbar({ quota = '—' }: TopbarProps) {
  const sesion = useSesion()
  const userInitial = (nombreCorto(sesion) || '?').charAt(0).toUpperCase()
  const userLabel = sesion?.usuario.email ?? ''

  return (
    <header className="sticky top-0 z-20 flex items-center gap-7 border-b border-line bg-white px-8 py-3.5 max-[1180px]:gap-4 max-[900px]:flex-wrap max-[900px]:gap-3 max-[720px]:gap-x-3 max-[720px]:gap-y-2.5 max-[720px]:px-4 max-[720px]:py-2.5">
      <div>
        <button
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-2.5 py-1.5 text-[13px] font-semibold text-ink max-[1180px]:hidden"
          type="button"
        >
          <svg className="shrink-0 rounded-[2px]" width="18" height="13" viewBox="0 0 18 13">
            <rect width="18" height="13" rx="2" fill="#D91023" />
            <rect x="6" width="6" height="13" fill="#fff" />
          </svg>
          Perú
          <span className={pillPrimary}>+4 pronto</span>
          <svg className="text-faint" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <NavLink to="/app/descubrimiento" className="mr-auto font-serif text-[24px] font-semibold text-ink">
        LiciHub<span className="text-primary">.</span>
      </NavLink>

      <nav className="mr-auto flex items-center gap-1 max-[900px]:order-3 max-[900px]:w-full max-[900px]:justify-between max-[720px]:mr-0 max-[720px]:overflow-x-auto">
        <NavLink to="/app/descubrimiento" className={navClass}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="8" cy="8" r="1.6" fill="currentColor" />
          </svg>
          Descubrimiento
        </NavLink>
        <NavLink to="/app/desbloqueos" className={navClass}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Mis desbloqueos
        </NavLink>
        <NavLink to="/app/equipo" className={navClass}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="5.5" cy="6" r="2" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="11" cy="6.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
            <path d="M2 13c0-2 1.5-3.5 3.5-3.5S9 11 9 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M9.5 13c0-1.7 1.2-3 3-3s2.8 1.3 2.8 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Mi equipo
        </NavLink>
        <NavLink to="/app/perfil" className={navClass}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M3 13c0-2.5 2.2-4 5-4s5 1.5 5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Mi perfil
        </NavLink>
      </nav>

      <div className="flex items-center gap-3">
        <span className={pillNeutral} title="Licitaciones desbloqueadas / disponibles en tu cuenta">
          <span className={dot} style={{ background: 'var(--color-success)' }} />
          🔓 {quota}{' '}
          <span className="text-[10px] tracking-[0.04em] text-faint uppercase max-[1180px]:hidden">desbloqueos</span>
        </span>
        <button
          className="inline-flex size-[34px] items-center justify-center rounded-full border border-line bg-white text-muted hover:border-primary-line hover:text-primary"
          type="button"
          aria-label="Notificaciones"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M9 2.5c-2.2 0-4 1.8-4 4v2.2c0 .5-.2 1-.5 1.4L3.5 11.5c-.5.6 0 1.5.8 1.5h9.4c.8 0 1.3-.9.8-1.5l-1-1.4c-.3-.4-.5-.9-.5-1.4V6.5c0-2.2-1.8-4-4-4Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path d="M7.3 14.5a1.7 1.7 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <div
          className="inline-flex size-[34px] items-center justify-center rounded-full bg-primary text-[13px] font-bold text-white"
          title={userLabel}
        >
          {userInitial}
        </div>
        <button
          className="border-none bg-transparent px-1 py-1.5 text-[13px] font-semibold text-muted hover:text-primary"
          type="button"
          onClick={() => logout()}
        >
          Salir
        </button>
      </div>
    </header>
  )
}
