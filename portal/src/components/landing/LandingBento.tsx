const pasos = [
  ['RUC SUNAT (CIIU)', 'Actividades económicas vinculadas', 'OK'],
  ['Estado RNP (OECE)', 'Capacidad máxima de contratación', 'VIGENTE'],
  ['Departamento y Rubro', 'Filtro territorial preferencial', 'CONFIG'],
  ['Historial de Afinidad', 'Algoritmo de probabilidad de éxito', 'ACTIVO'],
]

export function LandingBento() {
  return (
    <section className="relative border-y border-brand-border bg-white py-24" id="como-funciona">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-extrabold tracking-wider text-brand-blue uppercase">Flujo automatizado</span>
          <h2 id="ia-iso" className="mt-3 text-3xl font-extrabold tracking-tight text-brand-ink sm:text-4xl lg:text-5xl">Procesamos el SEACE con IA para tu empresa</h2>
          <p className="mt-4 text-base text-brand-subtle sm:text-lg">LiciHub lee cada expediente técnico, revisa las bases integradas y las cruza instantáneamente con el perfil comercial de tu RUC.</p>
        </div>
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
          <div className="rounded-3xl border border-brand-border bg-brand-bg p-6 shadow-xs sm:p-8 lg:col-span-4">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-blue-600/10 font-bold text-brand-blue">1</div>
              <div>
                <span className="text-[11px] font-bold tracking-wider text-brand-blue uppercase">Paso uno</span>
                <h3 className="text-lg leading-tight font-bold text-brand-ink">Ingresas tu RUC una sola vez</h3>
              </div>
            </div>
            <div className="space-y-3">
              {pasos.map(([titulo, detalle, estado]) => (
                <div key={titulo} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3.5">
                  <div>
                    <div className="text-xs font-bold text-brand-ink">{titulo}</div>
                    <div className="text-[11px] text-brand-subtle">{detalle}</div>
                  </div>
                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{estado}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center p-4 text-center lg:col-span-3">
            <div className="relative flex size-36 items-center justify-center">
              <div className="absolute inset-0 animate-ping rounded-full bg-blue-500/10" />
              <div className="absolute inset-2 animate-pulse rounded-full bg-emerald-500/15" />
              <div className="relative z-10 flex size-24 flex-col items-center justify-center rounded-3xl border-2 border-brand-blue bg-gradient-to-tr from-brand-ink to-slate-800 text-white shadow-xl">
                <span className="font-mono text-[10px] tracking-widest text-slate-300">LiciAI-v3</span>
              </div>
            </div>
            <span className="mt-4 inline-block rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-brand-emerald-dark">+15,000 licitaciones analizadas</span>
            <p className="mt-2 font-mono text-xs text-brand-subtle">SEACE 3.0 • En vivo 24/7</p>
          </div>
          <div className="rounded-3xl border border-brand-border bg-gradient-to-b from-white to-slate-50/50 p-6 shadow-subtle sm:p-8 lg:col-span-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-600/10 font-bold text-brand-emerald">2</div>
                <div>
                  <span className="text-[11px] font-bold tracking-wider text-brand-emerald-dark uppercase">Resultado</span>
                  <h3 className="text-lg font-bold text-brand-ink">Te decimos qué licitar e ISO clave</h3>
                </div>
              </div>
              <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-extrabold text-white">92 / 100 pts</span>
            </div>
            <div className="space-y-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
              <span className="rounded bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-brand-blue">LP-ABR-45-2026-SBS-1</span>
              <h4 className="text-sm font-bold text-brand-ink">Infraestructura TI y Nube Híbrida</h4>
              <p className="text-xs text-brand-subtle">Superintendencia de Banca, Seguros y AFP · S/ 4.85M</p>
              <div className="flex items-center justify-between rounded-xl border border-emerald-200/80 bg-emerald-50/90 p-2.5">
                <span className="text-xs font-bold text-emerald-950">ISO 27001 + ISO 9001 sugeridas</span>
                <span className="text-[11px] font-bold text-emerald-700">+8 pts</span>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/70 p-3"><span className="font-medium text-brand-slate">Hospital Regional Cusco - Equipamiento</span><span className="font-bold text-brand-blue">S/ 12.4M</span></div>
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/70 p-3"><span className="font-medium text-brand-slate">Mantenimiento Red Vial Puno</span><span className="font-bold text-brand-blue">S/ 8.9M</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
