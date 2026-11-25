import { Link } from 'react-router-dom'
import type { Sesion } from '../../types/models'
import { REGISTRO, esCliente, panelDe } from './destino'

function Flecha() {
  return (
    <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function LandingHero({ sesion }: { sesion: Sesion | null }) {
  const desbloquear = !sesion ? REGISTRO : esCliente(sesion) ? '/app/descubrimiento' : panelDe(sesion)
  return (
    <section id="inicio" className="bg-grid-dots relative overflow-hidden pt-36 pb-20 sm:pt-44">
      <div className="hero-glow-blue pointer-events-none absolute inset-0" />
      <div className="hero-glow-emerald pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-border bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-brand-slate shadow-xs">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-brand-emerald" />
          </span>
          Sincronizado con SEACE 3.0, SUNAT y RNP (OECE)
        </div>
        <h1 className="mx-auto max-w-5xl text-4xl font-extrabold tracking-tight text-brand-ink sm:text-6xl lg:text-7xl">
          Gana más licitaciones del Estado con <span className="text-brand-blue">IA</span> y <span className="text-brand-emerald">certificaciones ISO.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed font-normal text-brand-subtle sm:text-xl">
          Cruza tu RUC con las convocatorias abiertas del SEACE, descubre en segundos en cuáles encajas y qué norma ISO te da el puntaje ganador.
        </p>
        <div className="mx-auto mt-8 flex max-w-md flex-col items-center justify-center gap-3.5 sm:max-w-none sm:flex-row">
          <Link className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-emerald to-brand-emerald-dark px-7 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-500/25 sm:w-auto" to={desbloquear}>
            Empieza gratis (5 créditos) <Flecha />
          </Link>
          <a className="inline-flex w-full items-center justify-center gap-2.5 rounded-full border border-brand-border bg-white px-6 py-3.5 text-sm font-bold text-brand-slate shadow-xs hover:bg-slate-50 sm:w-auto" href="/api/auth/google">
            <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3h3.86c2.26-2.09 3.685-5.17 3.685-9.09z" fill="#4285F4" />
              <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.26v3.09C3.25 21.3 7.31 24 12 24z" fill="#34A853" />
              <path d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.26C.46 8.23 0 10.06 0 12s.46 3.77 1.26 5.38l4.01-3.09z" fill="#FBBC05" />
              <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.26 6.62l4.01 3.09c.95-2.85 3.6-4.96 6.73-4.96z" fill="#EA4335" />
            </svg>
            Continuar con Google
          </a>
        </div>
        <p className="mt-4 text-xs text-brand-subtle">Sin tarjeta de crédito requerida • Cumplimiento Ley N° 29733 de Protección de Datos</p>
        <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-6 text-left md:grid-cols-2 lg:gap-8">
          <article className="relative overflow-hidden rounded-3xl border border-brand-border bg-white p-6 shadow-subtle transition-all hover:shadow-card-hover">
            <div className="pointer-events-none space-y-3 font-mono text-xs opacity-45 blur-[2.5px] select-none" aria-hidden="true">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="font-bold text-blue-600">LP-SM-2-2026-GRA-1</span>
                <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-800">CONVOCADO</span>
              </div>
              <p className="font-sans text-sm font-bold text-slate-800">Mejoramiento de Infraestructura Educativa San Jerónimo</p>
              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div>Entidad: Gob. Reg. Cusco</div>
                <div>Monto ref: S/ 1,420,000.00</div>
                <div>CIIU: 4100 - Construcción</div>
                <div>Plazo presentación: 14 días</div>
              </div>
              <div className="h-2 w-3/4 rounded bg-blue-200" />
            </div>
            <div className="relative -mt-[70px] rounded-2xl border border-blue-200 bg-white/95 p-5 shadow-lg backdrop-blur-md">
              <div className="mb-3 flex items-center justify-between">
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold tracking-wide text-brand-blue uppercase">Desbloqueo con IA</span>
                <span className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-brand-blue">94% Match Directo</span>
              </div>
              <h3 className="text-base leading-tight font-bold text-brand-ink">Licitación compatible con tu capacidad RNP</h3>
              <p className="mt-1 text-xs text-brand-subtle">Tu experiencia acreditada cubre el 100% de la facturación requerida en las bases técnicas.</p>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="text-xs font-medium text-brand-slate">Costo: <span className="font-bold text-brand-blue">1 crédito</span></div>
                <Link className="inline-flex items-center gap-1 rounded-xl bg-brand-blue px-4 py-2 text-xs font-bold text-white hover:bg-blue-700" to={desbloquear}>Desbloquear detalle</Link>
              </div>
            </div>
          </article>
          <article className="relative overflow-hidden rounded-3xl border border-brand-border bg-white p-6 shadow-subtle transition-all hover:shadow-card-hover">
            <div className="pointer-events-none space-y-3 font-mono text-xs opacity-45 blur-[2.5px] select-none" aria-hidden="true">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="font-bold text-emerald-700">CAPÍTULO IV: FACTORES DE EVALUACIÓN</span>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">+10 PUNTOS TÉCNICOS</span>
              </div>
              <p className="font-sans text-sm font-bold text-slate-800">Certificaciones de Gestión de Calidad y Seguridad Ocupacional</p>
              <div className="space-y-1 text-slate-600">
                <div>• Norma ISO 9001:2015 vigente acreditada INACAL (5 pts)</div>
                <div>• Norma ISO 45001:2018 o ISO 14001 (5 pts)</div>
              </div>
              <div className="h-2 w-2/3 rounded bg-emerald-200" />
            </div>
            <div className="relative -mt-[70px] rounded-2xl border border-emerald-200 bg-white/95 p-5 shadow-lg backdrop-blur-md">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold tracking-wide text-brand-emerald-dark uppercase">Impulso ISO Estratégico</span>
                <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">+10 Pts Adicionales</span>
              </div>
              <h3 className="text-base leading-tight font-bold text-brand-ink">Pack Recomendado: ISO 9001 + ISO 45001</h3>
              <p className="mt-1 text-xs text-brand-subtle">El 73% de los ganadores de este rubro aseguraron el primer lugar gracias a la bonificación técnica ISO.</p>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="text-xs font-medium text-brand-slate">Asesoría disponible</div>
                <a className="inline-flex items-center gap-1 rounded-xl bg-brand-emerald px-4 py-2 text-xs font-bold text-white hover:bg-brand-emerald-dark" href="#telegram">Ver recomendación ISO</a>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
