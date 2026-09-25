import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useOnboarding } from '../context/OnboardingContext'
import { licitaciones as fetchLicitaciones, mensajeError } from '../lib/api'
import type { ConvocatoriaApi } from '../types/models'

const PAGE_SIZE = 10
const DEPARTAMENTOS = [
  'Amazonas', 'Ancash', 'Apurimac', 'Arequipa', 'Ayacucho', 'Cajamarca', 'Callao', 'Cusco', 'Huancavelica',
  'Huanuco', 'Ica', 'Junin', 'La Libertad', 'Lambayeque', 'Lima', 'Loreto', 'Madre de Dios', 'Moquegua',
  'Pasco', 'Piura', 'Puno', 'San Martin', 'Tacna', 'Tumbes', 'Ucayali',
]
const OBJETOS = ['Bien', 'Servicio', 'Obra', 'Consultoría']
const ETAPAS = ['Vigente', 'Convocado', 'Adjudicado', 'Contratado', 'Consentido', 'Desierto', 'Cancelado']

function saludo(): string {
  const hora = new Date().getHours()
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function plano(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function parseMonto(valor: string | null): number {
  const limpio = String(valor ?? '').replace(/[^\d.]/g, '')
  const numero = Number(limpio)
  return Number.isFinite(numero) ? numero : 0
}

function moneda(valor: number): string {
  if (valor >= 1_000_000) return `S/ ${(valor / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 0 })}M`
  return 'S/ ' + valor.toLocaleString('es-PE', { maximumFractionDigits: 0 })
}

function mesAnio(iso: string | null): string {
  if (!iso) return '—'
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return '—'
  return fecha.toLocaleDateString('es-PE', { month: 'short', year: 'numeric' })
}

function coincide(texto: string, keyword: string): boolean {
  return plano(texto).includes(plano(keyword))
}

function resaltar(texto: string, keywords: string[]) {
  const hit = keywords.find((keyword) => coincide(texto, keyword))
  if (!hit) return texto.slice(0, 180)
  const indice = plano(texto).indexOf(plano(hit))
  const inicio = Math.max(0, indice - 36)
  const recorte = `${inicio > 0 ? '…' : ''}${texto.slice(inicio, inicio + 170)}`
  const partes = recorte.split(new RegExp(`(${hit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i'))
  return partes.map((parte, index) =>
    plano(parte) === plano(hit) ? (
      <strong key={index} className="font-black text-emerald-800 underline decoration-emerald-400">
        {parte}
      </strong>
    ) : (
      <span key={index}>{parte}</span>
    ),
  )
}

interface Filtros {
  keywords: string[]
  departamento: string
  objeto: string
  etapa: string
  entidad: string
  fecha: string
  portal: string
}

function fechaDesde(fecha: string): string {
  if (fecha === 'Todo el tiempo') return ''
  const dias = fecha === 'Últimos 7 días' ? 7 : fecha === 'Últimos 30 días' ? 30 : 365
  const inicio = new Date()
  inicio.setDate(inicio.getDate() - dias)
  return inicio.toISOString().slice(0, 10)
}

export function DescubrimientoPage() {
  const onboarding = useOnboarding()
  const [data, setData] = useState({ items: [] as ConvocatoriaApi[], total: 0, page: 1, pages: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nuevaKeyword, setNuevaKeyword] = useState('')
  const [editando, setEditando] = useState(false)
  const [soloIntereses, setSoloIntereses] = useState(true)
  const [page, setPage] = useState(1)
  const [filtros, setFiltros] = useState<Filtros>({
    keywords: onboarding.selectedKeywords,
    departamento: '',
    objeto: '',
    etapa: '',
    entidad: '',
    fecha: 'Todo el tiempo',
    portal: '',
  })

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(PAGE_SIZE))
    if (soloIntereses && filtros.keywords.length) params.set('keywords', filtros.keywords.join(','))
    if (filtros.departamento) params.set('departamento', filtros.departamento)
    if (filtros.objeto) params.set('objeto', filtros.objeto)
    if (filtros.etapa) params.set('etapa', filtros.etapa)
    if (filtros.entidad.trim()) params.set('entidad', filtros.entidad.trim())
    const desde = fechaDesde(filtros.fecha)
    if (desde) params.set('fecha_desde', desde)
    if (filtros.portal) params.set('portal', filtros.portal)

    const controlador = new AbortController()
    setLoading(true)
    setError(null)
    fetchLicitaciones(params)
      .then((respuesta) => {
        if (!controlador.signal.aborted) setData(respuesta)
      })
      .catch((err: unknown) => {
        if (!controlador.signal.aborted) setError(mensajeError(err, 'No se pudieron cargar las licitaciones.'))
      })
      .finally(() => {
        if (!controlador.signal.aborted) setLoading(false)
      })
    return () => controlador.abort()
  }, [filtros, page, soloIntereses])

  const cambiarFiltro = (parcial: Partial<Filtros>) => {
    setFiltros((actual) => ({ ...actual, ...parcial }))
    setPage(1)
  }

  const keywords = filtros.keywords
  const linea = onboarding.company?.rubro || 'Tu línea de negocio'
  const ciiu = onboarding.company?.ciius[0]
  const desdeFila = data.total === 0 ? 0 : (data.page - 1) * PAGE_SIZE + 1
  const hastaFila = Math.min(data.page * PAGE_SIZE, data.total)

  const quitarKeyword = (keyword: string) => cambiarFiltro({ keywords: keywords.filter((item) => item !== keyword) })
  const agregarKeyword = () => {
    const texto = nuevaKeyword.trim()
    if (!texto || keywords.some((item) => plano(item) === plano(texto))) return
    cambiarFiltro({ keywords: [...keywords, texto] })
    setNuevaKeyword('')
    setEditando(false)
  }

  return (
    <div className="min-h-full bg-slate-50/70 font-[Plus_Jakarta_Sans,Inter,sans-serif] text-[14px] text-slate-800">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur-md lg:px-8">
        <div className="mx-auto flex max-w-[1720px] items-center justify-between gap-4">
          <button className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold" type="button">
            <span className="inline-flex h-3 w-4 overflow-hidden rounded-sm ring-1 ring-slate-200">
              <svg className="h-full w-full" viewBox="0 0 18 13">
                <rect width="6" height="13" fill="#d91023" />
                <rect x="6" width="6" height="13" fill="#fff" />
                <rect x="12" width="6" height="13" fill="#d91023" />
              </svg>
            </span>
            Perú
            <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-blue-600 uppercase">+4 pronto</span>
          </button>
          <div className="flex items-center gap-6">
            <NavLink to="/app/descubrimiento" className="flex items-baseline text-xl font-extrabold tracking-tight text-slate-900">
              Liciti<span className="font-black text-blue-600">Go</span>
            </NavLink>
            <nav className="hidden items-center rounded-full border border-slate-200/90 bg-slate-100 p-1 md:flex">
              <NavLink to="/app/descubrimiento" className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-blue-600 shadow-sm">
                Descubrimiento
              </NavLink>
              <NavLink to="/app/equipo" className="rounded-full px-4 py-1.5 text-xs font-semibold text-slate-600">
                Mi equipo
              </NavLink>
            </nav>
          </div>
          <div className="flex size-8 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">
            {onboarding.userName.slice(0, 1)}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-8">
        <section className="mb-6">
          <span className="text-[11px] font-extrabold tracking-wider text-blue-600 uppercase">Descubrimiento de oportunidades</span>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
            {saludo()}, {onboarding.userName}!
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Explora las licitaciones que coinciden con las palabras clave que elegiste en el onboarding.
          </p>
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-12">
          <aside className="space-y-5 lg:col-span-3">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">Mi línea de negocio</h2>
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">1</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-blue-300 bg-blue-50/50 p-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-900">{linea}</h3>
                  <span className="text-[11px] text-slate-500">{keywords.length} palabras clave</span>
                </div>
              </div>
            </div>
            <div className="space-y-2.5 rounded-2xl border border-slate-200/90 bg-white p-4 text-xs shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 font-semibold text-slate-500">
                <span>RUC de la empresa</span>
                <span className="font-mono font-bold text-slate-800">{onboarding.company?.ruc ?? '—'}</span>
              </div>
              <div>
                <span className="block text-[11px] font-semibold tracking-wider text-slate-400 uppercase">CIIU asignado</span>
                <p className="mt-0.5 font-bold text-slate-800">
                  {ciiu ? `${ciiu.codigo} - ${ciiu.descripcion}` : 'Completa el onboarding para ver tu CIIU'}
                </p>
              </div>
            </div>
          </aside>

          <section className="space-y-5 lg:col-span-9">
            <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
              <div className="border-l-4 border-blue-600 pl-3">
                <h2 className="text-lg font-black tracking-tight text-slate-900 md:text-xl">{linea}</h2>
                <p className="text-xs text-slate-500">
                  Resultados de esta línea · <strong className="text-slate-700">{data.total.toLocaleString('es-PE')} licitaciones</strong> coinciden con lo que vendes
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="size-2 rounded-full bg-blue-600" />
                <span className="text-xs font-extrabold tracking-wider text-slate-900">PALABRAS CLAVE</span>
                <span className="rounded bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600">{keywords.length}</span>
              </div>
              <p className="mb-3 text-[11px] leading-snug text-slate-500">
                Un solo listado con lo que elegiste en el onboarding. Sirve para encontrar esos productos dentro de la descripción de cada licitación.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((keyword) => (
                  <span key={keyword} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                    {keyword}
                    <button className="text-blue-400 hover:text-blue-900" type="button" onClick={() => quitarKeyword(keyword)} aria-label={`Quitar ${keyword}`}>
                      ×
                    </button>
                  </span>
                ))}
                {editando ? (
                  <input
                    className="rounded-lg border border-blue-400 px-2.5 py-1 text-xs outline-none"
                    value={nuevaKeyword}
                    autoFocus
                    placeholder="Nueva palabra"
                    onChange={(event) => setNuevaKeyword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') agregarKeyword()
                    }}
                    onBlur={agregarKeyword}
                  />
                ) : (
                  <button
                    className="rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-blue-500 hover:text-blue-600"
                    type="button"
                    onClick={() => setEditando(true)}
                  >
                    + Añadir
                  </button>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                <span className="mr-1 text-[11px] font-extrabold tracking-wider text-slate-400 uppercase">Filtros</span>
                <Filtro label="Departamento" value={filtros.departamento || 'Todos'} options={['Todos', ...DEPARTAMENTOS]} onChange={(valor) => cambiarFiltro({ departamento: valor === 'Todos' ? '' : valor })} />
                <Filtro label="Fecha" value={filtros.fecha} options={['Todo el tiempo', 'Últimos 7 días', 'Últimos 30 días', 'Último año']} onChange={(valor) => cambiarFiltro({ fecha: valor })} />
                <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-sm">
                  <span className="font-normal text-slate-400">Entidad</span>
                  <input
                    className="w-28 bg-transparent font-bold outline-none"
                    placeholder="Todas"
                    value={filtros.entidad}
                    onChange={(event) => cambiarFiltro({ entidad: event.target.value })}
                  />
                </label>
                <Filtro label="Etapas" value={filtros.etapa || 'Todas'} options={['Todas', ...ETAPAS]} onChange={(valor) => cambiarFiltro({ etapa: valor === 'Todas' ? '' : valor })} />
                <Filtro label="Objeto" value={filtros.objeto || 'Todos'} options={['Todos', ...OBJETOS]} onChange={(valor) => cambiarFiltro({ objeto: valor === 'Todos' ? '' : valor })} />
                <Filtro
                  label="Cuantía"
                  value={filtros.portal === 'menor' ? 'Menores' : filtros.portal === 'mayor' ? 'Mayores' : 'Todas'}
                  options={['Todas', 'Menores', 'Mayores']}
                  onChange={(valor) => cambiarFiltro({ portal: valor === 'Menores' ? 'menor' : valor === 'Mayores' ? 'mayor' : '' })}
                />
                <button
                  className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1 text-xs font-bold ${
                    soloIntereses ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-600'
                  }`}
                  type="button"
                  onClick={() => setSoloIntereses((valor) => !valor)}
                >
                  {soloIntereses ? 'Ver solo mis intereses' : 'Ver todo el listado'}
                </button>
              </div>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {loading ? <p className="text-sm text-slate-500">Consultando licitaciones…</p> : null}

            <div>
              <h2 className="mb-3 text-base font-extrabold tracking-tight text-slate-900">Resultados</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi titulo="Total de licitaciones" valor={data.total.toLocaleString('es-PE')} detalle={`Página ${data.page} de ${data.pages || 1}`} tono="text-blue-600" />
                <Kpi titulo="En esta página" valor={String(data.items.length)} detalle={`${PAGE_SIZE} por página`} tono="text-emerald-600" />
                <Kpi titulo="Palabras clave" valor={String(keywords.length)} detalle={soloIntereses ? 'Filtro activo en el servidor' : 'Mostrando todo el padrón'} tono="text-amber-500" />
                <Kpi titulo="Páginas" valor={String(data.pages)} detalle="Calculadas en Supabase" tono="text-purple-600" />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-extrabold tracking-wider text-slate-500 uppercase">
                      <th className="py-3.5 pr-3 pl-6">Licitación</th>
                      <th className="px-3 py-3.5">Ubicación</th>
                      <th className="px-3 py-3.5">Publicación</th>
                      <th className="px-3 py-3.5">Objeto</th>
                      <th className="px-3 py-3.5">Etapa</th>
                      <th className="px-4 py-3.5 text-emerald-700">Monto · oportunidad</th>
                      <th className="py-3.5 pr-6 pl-2 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {data.items.map((item) => {
                      const texto = item.descripcion || 'Sin descripción'
                      const hits = keywords.filter((keyword) => coincide(texto, keyword))
                      return (
                        <tr key={item.nomenclatura_norm} className="group hover:bg-slate-50/80">
                          <td className="min-w-[220px] py-4 pr-3 pl-6 align-top">
                            <div className="font-bold text-slate-900 group-hover:text-blue-600">{item.nomenclatura || item.nomenclatura_norm}</div>
                          </td>
                          <td className="px-3 py-4 align-top font-bold whitespace-nowrap text-slate-800">{item.departamento}</td>
                          <td className="px-3 py-4 align-top font-medium whitespace-nowrap text-slate-600">{mesAnio(item.fecha_publicacion)}</td>
                          <td className="px-3 py-4 align-top">
                            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">{item.objeto || '—'}</span>
                          </td>
                          <td className="px-3 py-4 align-top">
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700">{item.etapa_seace || item.estado || '—'}</span>
                          </td>
                          <td className="max-w-[380px] px-4 py-4 align-top">
                            <div className="mb-1 text-[11px] text-slate-400">
                              Valor referencial <span className="font-mono font-bold text-slate-600">{parseMonto(item.monto) > 0 ? moneda(parseMonto(item.monto)) : 'S/ —'}</span>
                            </div>
                            <div className="inline-flex items-start gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/90 p-2 text-[11px] text-emerald-900">
                              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                              <p className="leading-tight">{resaltar(texto, hits.length ? hits : keywords)}</p>
                            </div>
                          </td>
                          <td className="py-4 pr-6 pl-2 text-right align-top">
                            <Link
                              className="inline-flex rounded-xl border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50"
                              to={`/app/licitacion/${encodeURI(item.nomenclatura_norm)}`}
                            >
                              Ver
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200/80 bg-slate-50/50 px-6 py-4 text-xs text-slate-500 sm:flex-row">
                <span>
                  Mostrando <strong className="text-slate-800">{desdeFila} – {hastaFila}</strong> de <strong className="text-slate-800">{data.total.toLocaleString('es-PE')}</strong>
                </span>
                <div className="inline-flex items-center gap-1">
                  <button className="rounded-lg border border-slate-200 bg-white px-2 py-1 disabled:text-slate-300" type="button" disabled={data.page <= 1} onClick={() => setPage((n) => n - 1)}>
                    ←
                  </button>
                  <span className="rounded-lg bg-blue-600 px-3 py-1 font-bold text-white">{data.page}</span>
                  <span className="px-1">de {data.pages || 1}</span>
                  <button className="rounded-lg border border-slate-200 bg-white px-2 py-1 disabled:text-slate-300" type="button" disabled={data.page >= data.pages} onClick={() => setPage((n) => n + 1)}>
                    →
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function Filtro({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-sm">
      <span className="font-normal text-slate-400">{label}</span>
      <select className="max-w-40 bg-transparent font-bold outline-none" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function Kpi({ titulo, valor, detalle, tono }: { titulo: string; valor: string; detalle: string; tono: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
      <span className="mb-1 block text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">{titulo}</span>
      <span className={`text-2xl font-black tracking-tight ${tono}`}>{valor}</span>
      <p className="mt-2 text-[11px] text-slate-500">{detalle}</p>
    </div>
  )
}
