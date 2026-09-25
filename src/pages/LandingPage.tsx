import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { btnPrimary, btnSecondary, card, container, dot, heading, pill, pillNeutral, pillPrimary } from '../lib/ui'

const checks = [
  'Alertas cuando sale algo a tu medida en tiempo real',
  'Match automático según tu empresa, RUC y rubro SEACE',
  'Menos ruido, más chances de vender al Estado peruano',
]

export function LandingPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')

  const goOnboarding = () => navigate('/onboarding')

  return (
    <div className="flex min-h-full flex-col bg-[radial-gradient(circle_at_85%_0%,#eef2ff_0%,transparent_45%),var(--color-canvas)]">
      <header className={`${container} flex items-center justify-between py-[22px]`}>
        <div className="flex items-center gap-2.5">
          <span className={`${heading} text-2xl font-semibold`}>Lici</span>
          <span className={`${pillPrimary} font-mono tracking-[0.02em]`}>PRO</span>
          <span className="text-faint">•</span>
          <span className="text-xs font-bold tracking-[0.04em] text-muted">CONTRATACIONES DEL ESTADO</span>
        </div>
        <div className="flex items-center gap-[18px]">
          <span className={pillNeutral}>
            <span className={dot} style={{ background: '#16a34a' }} />
            Perú • SEACE 3.0
          </span>
          <span>
            ¿Ya tienes cuenta?{' '}
            <Link to="/onboarding" className="font-semibold text-primary">
              Entrar
            </Link>
          </span>
        </div>
      </header>

      <main className={`${container} grid flex-1 grid-cols-[1.1fr_0.9fr] items-start gap-16 pt-14 pb-[72px] max-[980px]:grid-cols-1`}>
        <section className="flex max-w-[560px] flex-col gap-5">
          <span className={`${pillPrimary} self-start`}>
            <span className={dot} style={{ background: '#2f5bea' }} />
            INTELIGENCIA DE CONTRATACIONES PÚBLICAS
          </span>
          <h1 className={`${heading} text-[44px] text-ink max-[980px]:text-[34px]`}>
            Deja de perder licitaciones que ya encajan con tu empresa.
          </h1>
          <p className="text-[17px] leading-normal text-muted">
            Recibe licitaciones personalizadas según tu rubro: solo lo que encaja con lo que tu empresa vende o presta.
          </p>
          <ul className="my-1 flex flex-col gap-2.5">
            {checks.map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-[14.5px] text-ink">
                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-2 rounded-lg border border-navy-line bg-linear-to-b from-navy to-navy-soft px-[22px] py-5 text-white">
            <div className="mb-4 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.04em]">
                <span className={dot} style={{ background: '#22c55e' }} />
                RADAR EN VIVO SEACE 3.0
              </span>
              <span className={`${pill} border border-[#34d399]/25 bg-[#34d399]/12 text-[11px] text-[#34d399]`}>
                <span className={dot} style={{ background: '#34d399' }} />
                EN TIEMPO REAL
              </span>
            </div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <span className={`${pill} mb-2.5 border border-white/14 bg-white/8 text-[#e2e8f0]`}>98% Match con tu rubro</span>
                <p className="mb-1 text-[17px] font-semibold">Adquisición de servidores e infraestructura TI</p>
                <p className="text-[13px] text-[#94a3b8]">Municipalidad Provincial • Licitación Pública</p>
              </div>
              <div className="shrink-0 text-right">
                <span className="mb-1 block text-[11px] text-[#94a3b8]">MONTO ESTIMADO</span>
                <strong className="text-xl">S/ 145,000</strong>
              </div>
            </div>
            <div className="mt-4 flex justify-between border-t border-white/8 pt-3.5 text-xs text-[#64748b]">
              <span>Sincronizado con OSCE, SEACE y SUNAT</span>
              <span>Conexión RNP Activa</span>
            </div>
          </div>

          <p className="flex items-center gap-2 text-[13px] text-muted">
            <span className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border border-line bg-canvas text-[10px] font-bold">
              N
            </span>
            Empieza gratis • Sin tarjeta requerida • Escala cuando cierres más contratos con el Estado
          </p>
        </section>

        <section className={`${card} p-8 shadow-panel`}>
          <div className="mb-2 flex justify-between text-[11px] font-bold tracking-[0.04em] text-faint">
            <span>PASO 1 DE 4 • ACCESO</span>
            <span>25% Completado</span>
          </div>
          <div className="h-[5px] overflow-hidden rounded-full bg-canvas">
            <div className="h-full w-1/4 rounded-full bg-primary" />
          </div>
          <h2 className={`${heading} mt-[22px] text-[26px]`}>Crear cuenta</h2>
          <p className="mt-2 mb-[22px] text-sm text-muted">Continúa con Google o con tu correo de trabajo.</p>
          <button className={`${btnSecondary} w-full`} type="button" onClick={goOnboarding}>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.55-1.84.87-3.06.87-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18Z" />
              <path fill="#FBBC05" d="M3.95 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l2.99-2.33Z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
            </svg>
            Continuar con Google
          </button>
          <div className="my-5 flex items-center gap-3 text-[11px] font-bold tracking-[0.05em] text-faint before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
            <span>O CON CORREO</span>
          </div>
          <label className="mb-2 block text-[13px] font-semibold" htmlFor="email">
            Email de trabajo
          </label>
          <input
            id="email"
            className="mb-[18px] w-full rounded-md border border-line-strong px-3.5 py-3 text-sm focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-soft)] focus:outline-none"
            type="email"
            placeholder="ana@empresa.pe"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button className={`${btnPrimary} w-full`} type="button" onClick={goOnboarding}>
            Continuar con correo
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M8 3.5 11.5 7 8 10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <p className="mt-4 text-xs leading-relaxed text-muted [&_a]:font-semibold [&_a]:text-primary">
            Al continuar aceptas los <a href="#terminos">Términos y Condiciones</a> y la <a href="#privacidad">Política de Privacidad</a>. En el
            siguiente paso configuramos tu empresa con el <strong>RUC</strong>.
          </p>
          <p className="mt-[18px] text-center text-xs text-faint">🔒 Protección de datos Ley N° 29733 • Encriptación bancaria SSL</p>
        </section>
      </main>

      <footer className={`${container} flex items-center justify-between border-t border-line py-[22px] text-[13px] text-faint`}>
        <span>Lici Intelligence Platform © 2026. Todos los derechos reservados.</span>
        <div className="flex gap-[22px] [&_a:hover]:text-primary">
          <a href="#seguridad">Seguridad OSCE/SEACE</a>
          <a href="#ayuda">Centro de Ayuda</a>
          <a href="#contacto">Contacto</a>
        </div>
      </footer>
    </div>
  )
}
