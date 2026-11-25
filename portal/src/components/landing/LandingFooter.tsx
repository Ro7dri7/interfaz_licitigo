import { Link } from 'react-router-dom'
import { TELEGRAM_BOT } from './destino'

export function LandingFooter() {
  return (
    <>
      <footer className="border-t border-slate-800 bg-brand-ink pt-16 pb-12 text-slate-300">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 border-b border-slate-800 pb-12 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-2">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-tr from-brand-blue to-brand-emerald text-sm font-bold text-white">LH</div>
                <span className="text-xl font-extrabold tracking-tight text-white">Lici<span className="text-blue-400">Hub</span></span>
              </div>
              <p className="max-w-sm text-xs leading-relaxed text-slate-400">Plataforma peruana de inteligencia de compras públicas. Procesamiento en tiempo real del SEACE 3.0 con IA generativa y recomendaciones estratégicas de normas ISO.</p>
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300">Ley N° 29733 • Datos protegidos en Perú</div>
            </div>
            <div>
              <h4 className="mb-4 text-xs font-bold tracking-wider text-white uppercase">Producto</h4>
              <ul className="space-y-2.5 text-xs text-slate-400">
                <li><a className="hover:text-white" href="#como-funciona">Buscador con IA</a></li>
                <li><a className="hover:text-white" href="#telegram">Bot de Telegram</a></li>
                <li><a className="hover:text-white" href="#ia-iso">Puntaje ISO Ganador</a></li>
                <li><a className="hover:text-white" href="#precios">Precios y Créditos</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-xs font-bold tracking-wider text-white uppercase">Normas ISO</h4>
              <ul className="space-y-2.5 text-xs text-slate-400">
                <li><a className="hover:text-white" href="#ia-iso">ISO 9001 (Calidad)</a></li>
                <li><a className="hover:text-white" href="#ia-iso">ISO 14001 (Ambiental)</a></li>
                <li><a className="hover:text-white" href="#ia-iso">ISO 37001 (Antisoborno)</a></li>
                <li><a className="hover:text-white" href="#ia-iso">ISO 45001 (Seguridad)</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-xs font-bold tracking-wider text-white uppercase">Empresa</h4>
              <ul className="space-y-2.5 text-xs text-slate-400">
                <li><Link className="hover:text-white" to="/comercial">Espacio Comercial CRM</Link></li>
                <li>Términos del Servicio</li>
                <li>Política de Privacidad</li>
                <li>Libro de Reclamaciones</li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col items-center justify-between gap-4 pt-8 text-xs text-slate-400 sm:flex-row">
            <p>LiciHub © 2026. Todos los derechos reservados. Desarrollado para empresas peruanas.</p>
            <p>Hecho con ❤️ en Lima, Perú</p>
          </div>
        </div>
      </footer>
      <a className="fixed right-6 bottom-6 z-40 flex items-center gap-2 rounded-full bg-[#24A1DE] p-3 text-white shadow-lg shadow-blue-500/30 sm:px-4 sm:py-2.5" href={TELEGRAM_BOT} target="_blank" rel="noreferrer" aria-label="Consultar por Telegram">
        <span className="hidden text-xs font-bold sm:inline">Consultar por RUC</span>
      </a>
    </>
  )
}
