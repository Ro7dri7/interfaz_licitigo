import { TELEGRAM_BOT } from './destino'

const beneficios = [
  ['Validación RUC y RNP', 'Verifica al instante la habilitación legal para contratar con el Estado peruano.'],
  ['Match automático por CIIU', 'Descarta convocatorias irrelevantes y recibe solo las que tu empresa puede ganar.'],
  ['Sugerencia ISO por rubro', 'Conoce qué certificaciones (ISO 9001, 14001, 37001, 45001) son factor de desempate.'],
  ['Conexión directa con asesor', 'Un clic para cotizar la implementación acelerada de la norma solicitada.'],
]

export function LandingTelegram() {
  return (
    <section className="relative overflow-hidden bg-brand-bg py-24" id="telegram">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="mx-auto w-full max-w-md lg:col-span-5">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#24A1DE] px-4 py-3 text-white">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-white text-sm font-extrabold text-[#24A1DE]">LH</div>
                <div>
                  <div className="text-sm font-bold">LiciHub Bot Oficial</div>
                  <span className="text-[11px] text-blue-100/90">bot verificado • en línea</span>
                </div>
              </div>
            </div>
            <div className="min-h-[380px] space-y-3 bg-[#EFE7DE] p-4 text-xs">
              <div className="text-center"><span className="rounded-full bg-black/15 px-2 py-0.5 text-[10px] font-medium text-white">Hoy</span></div>
              <div className="flex justify-end">
                <div className="max-w-[78%] rounded-2xl rounded-tr-none bg-[#EEFFDE] px-3 py-2 text-brand-ink">
                  <p className="font-mono font-semibold">20601206481</p>
                  <div className="mt-0.5 text-right text-[9px] text-slate-400">10:42 AM ✓✓</div>
                </div>
              </div>
              <div className="max-w-[88%] space-y-2 rounded-2xl rounded-tl-none border border-slate-100 bg-white p-3 text-brand-ink">
                <p>👋 ¡Hola <strong>DYSAMAX CONSTRUCCIONES</strong>!</p>
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-2 text-[11px] text-brand-blue"><span className="font-bold">✓ RNP Vigente</span> | Sede: Cajamarca<br />CIIU: 4100 - Construcción de Edificios</div>
                <p>Encontré <strong>3 licitaciones abiertas</strong> para tu capacidad técnica hoy:</p>
                <div className="text-[11px] font-medium text-slate-700">1. MP Cajamarca - Pistas (S/ 2.4M)<br />2. GR La Libertad - Posta (S/ 3.1M)</div>
              </div>
              <div className="max-w-[88%] space-y-2 rounded-2xl rounded-tl-none border-l-4 border-brand-emerald bg-white p-3">
                <div className="text-[11px] font-bold text-brand-emerald-dark">💡 Recomendación ISO</div>
                <p className="text-[11px] text-slate-600">Para la obra de Cajamarca, el <strong>Pack ISO 9001 + ISO 45001</strong> te otorga <strong>10 puntos técnicos</strong> automáticos para asegurar el 1er lugar.</p>
              </div>
            </div>
            <div className="border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-400">Escribe tu RUC o palabra clave...</div>
          </div>
        </div>
        <div className="lg:col-span-7">
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-extrabold tracking-wider text-brand-blue uppercase">Notificaciones en tiempo real</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-brand-ink sm:text-4xl lg:text-5xl">Consulta por RUC y recibe alertas en segundos.</h2>
          <p className="mt-4 text-base leading-relaxed text-brand-subtle sm:text-lg">Sin ingresar a portales lentos ni memorizar claves. Envía tu RUC a nuestro bot y la IA filtra el SEACE completo, extrayendo oportunidades reales con su factor de evaluación.</p>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {beneficios.map(([titulo, texto]) => (
              <div key={titulo} className="rounded-2xl border border-brand-border bg-white p-5 shadow-xs hover:border-blue-300">
                <h3 className="text-sm font-bold text-brand-ink">{titulo}</h3>
                <p className="mt-1 text-xs text-brand-subtle">{texto}</p>
              </div>
            ))}
          </div>
          <a className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#24A1DE] px-6 py-3 text-sm font-bold text-white shadow-md shadow-blue-400/20" href={TELEGRAM_BOT} target="_blank" rel="noreferrer">Abrir Bot de Telegram gratis</a>
        </div>
      </div>
    </section>
  )
}
