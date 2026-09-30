import { useMemo, useState } from 'react'
import { Topbar } from '../components/Topbar'
import { MOCK_PIPELINE } from '../data/pipeline'
import { btnSecondary, card, container, dot, heading, pillNeutral, pillPrimary } from '../lib/ui'
import type { PipelineCard, PipelineEstado } from '../types/models'

interface ColumnDef {
  estado: PipelineEstado
  label: string
  dot: string
  emptyHint: string
}

const columns: ColumnDef[] = [
  { estado: 'sin-estado', label: 'Sin estado', dot: '#94a3b8', emptyHint: 'Lo que se guardó y todavía nadie revisó.' },
  { estado: 'revisada', label: 'Revisada', dot: '#2f5bea', emptyHint: 'Revisadas y a la espera de una decisión.' },
  { estado: 'negociando', label: 'Negociando', dot: '#d97706', emptyHint: 'Arrastra aquí lo que ya está en conversación con la entidad.' },
  { estado: 'vendida', label: 'Vendida', dot: '#16a34a', emptyHint: 'Sin ganadas registradas todavía.' },
  { estado: 'perdida', label: 'Perdida', dot: '#dc2626', emptyHint: 'Registra el motivo al perder; sirve para el histórico.' },
]

const chipBase = 'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-[7px] text-[12.5px] font-semibold'
const chip = (activo: boolean) =>
  `${chipBase} ${activo ? 'border-primary bg-primary text-white' : 'border-line-strong bg-white text-muted'}`

function currency(value: number): string {
  return 'S/ ' + value.toLocaleString('es-PE')
}

export function EquipoPage() {
  const [cards, setCards] = useState<PipelineCard[]>(MOCK_PIPELINE)
  const [responsableFilter, setResponsableFilter] = useState<string | null>(null)

  const responsables = useMemo(() => [...new Set(cards.map((card) => card.responsable))], [cards])
  const visibleCards = responsableFilter ? cards.filter((card) => card.responsable === responsableFilter) : cards

  const cardsFor = (estado: PipelineEstado) => visibleCards.filter((card) => card.estado === estado)
  const totalFor = (estado: PipelineEstado) => cardsFor(estado).reduce((sum, card) => sum + card.monto, 0)
  const enJuego = visibleCards.filter((card) => card.estado !== 'vendida' && card.estado !== 'perdida').reduce((sum, card) => sum + card.monto, 0)
  const ganadas = visibleCards.filter((card) => card.estado === 'vendida').length
  const perdidas = visibleCards.filter((card) => card.estado === 'perdida').length

  const cargaMasAlta = useMemo(() => {
    const counts = new Map<string, number>()
    for (const card of visibleCards) counts.set(card.responsable, (counts.get(card.responsable) ?? 0) + 1)
    let name = ''
    let max = 0
    for (const [person, count] of counts) {
      if (count > max) {
        max = count
        name = person
      }
    }
    return { name: name || '—', count: max }
  }, [visibleCards])

  const moveCard = (card: PipelineCard, estado: PipelineEstado) => {
    setCards((list) => list.map((item) => (item.id === card.id ? { ...item, estado } : item)))
  }

  return (
    <div className="min-h-full bg-canvas">
      <Topbar />
      <main className={`${container} flex flex-col gap-[22px] pt-6 pb-14`}>
        <section className="grid grid-cols-4 gap-4 max-[1300px]:grid-cols-2">
          <div className={`${card} flex flex-col gap-2 px-5 py-[18px]`}>
            <span className="text-[11px] font-bold tracking-[0.04em] text-faint uppercase">En juego por etapa · todo el equipo</span>
            <strong className="text-[24px] font-bold">{currency(enJuego)}</strong>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-canvas">
              <span style={{ flex: cardsFor('sin-estado').length || 0.001, background: '#94a3b8' }} />
              <span style={{ flex: cardsFor('revisada').length || 0.001, background: '#2f5bea' }} />
              <span style={{ flex: cardsFor('negociando').length || 0.001, background: '#d97706' }} />
            </div>
            <div className="flex flex-wrap gap-2.5 text-[11.5px] text-muted">
              <span><i className="mr-1 inline-block size-[7px] rounded-full bg-[#94a3b8]" />Sin estado {cardsFor('sin-estado').length}</span>
              <span><i className="mr-1 inline-block size-[7px] rounded-full bg-[#2f5bea]" />Revisada {cardsFor('revisada').length}</span>
              <span><i className="mr-1 inline-block size-[7px] rounded-full bg-[#d97706]" />Negociando {cardsFor('negociando').length}</span>
            </div>
          </div>
          <div className={`${card} flex flex-col gap-2 px-5 py-[18px]`}>
            <span className="text-[11px] font-bold tracking-[0.04em] text-faint uppercase">Carga más alta · todo el equipo</span>
            <strong className="text-[19px] font-bold">{cargaMasAlta.name}</strong>
            <span className="text-[12.5px] text-muted">{cargaMasAlta.count} oportunidades en pipeline</span>
          </div>
          <div className={`${card} flex flex-col gap-2 px-5 py-[18px]`}>
            <span className="text-[11px] font-bold tracking-[0.04em] text-faint uppercase">Cerradas este mes · equipo</span>
            <p className="flex items-baseline gap-1.5 text-[14px] text-muted">
              <strong className="mr-0.5 text-[20px] text-success">{ganadas}</strong> ganadas
              <strong className="mr-0.5 text-[20px] text-danger">{perdidas}</strong> perdidas
            </p>
            <span className="text-[12.5px] text-muted">Cierres del mes en curso.</span>
          </div>
          <div className={`${card} flex flex-col gap-2 px-5 py-[18px]`}>
            <span className="text-[11px] font-bold tracking-[0.04em] text-faint uppercase">Plazos cerca · equipo</span>
            <strong className="text-[24px] font-bold">
              2 <span className="ml-1 text-[13px] font-medium text-muted">con plazo cerca</span>
            </strong>
            <span className="text-[12.5px] text-muted">Etapas del cronograma en los próximos 15 días</span>
          </div>
        </section>

        <section className={`${card} flex flex-col gap-3.5 px-[22px] py-[18px]`}>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="mr-1.5 text-[11px] font-bold tracking-[0.05em] text-faint">LÍNEA DE NEGOCIO</span>
            <button className={chip(true)} type="button">Todas</button>
            <button className={chip(false)} type="button">maquinaria</button>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="mr-1.5 text-[11px] font-bold tracking-[0.05em] text-faint">RESPONSABLES</span>
            <button className={chip(responsableFilter === null)} type="button" onClick={() => setResponsableFilter(null)}>
              👥 Todo el equipo · {cards.length}
            </button>
            {responsables.map((name) => (
              <button
                key={name}
                className={chip(responsableFilter === name)}
                type="button"
                onClick={() => setResponsableFilter(name)}
              >
                {name}
              </button>
            ))}
            <span className="ml-auto text-[12.5px] text-muted">
              {visibleCards.length} de {cards.length} licitaciones
            </span>
          </div>
        </section>

        <section className="flex items-center justify-between">
          <div>
            <h2 className={`${heading} text-[19px]`}>Pipeline de seguimiento</h2>
            <span className="text-[13px] text-muted">cambia el estado comercial de cada tarjeta</span>
          </div>
          <div className="flex items-center gap-3">
            <button className={btnSecondary} type="button">⤓ Exportar</button>
            <div className="flex overflow-hidden rounded-md border border-line-strong">
              <button className="bg-primary-soft px-3.5 py-[9px] text-[13px] font-semibold text-primary" type="button">▦ Tablero</button>
              <button className="border-l border-line-strong bg-white px-3.5 py-[9px] text-[13px] font-semibold text-muted" type="button">☰ Lista</button>
              <button className="border-l border-line-strong bg-white px-3.5 py-[9px] text-[13px] font-semibold text-muted" type="button">📅 Calendario</button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-5 items-start gap-4 max-[1300px]:grid-cols-2 max-[700px]:grid-cols-[1fr]">
          {columns.map((column) => {
            const columnCards = cardsFor(column.estado)
            return (
              <div key={column.estado}>
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[13.5px] font-bold">
                    <span className={dot} style={{ background: column.dot }} />
                    {column.label} <span className="font-semibold text-faint">{columnCards.length}</span>
                  </span>
                  <span className="text-[12.5px] font-semibold text-muted">{currency(totalFor(column.estado))}</span>
                </div>
                <div className="flex min-h-[220px] flex-col gap-3">
                  {columnCards.length === 0 ? (
                    <div className="rounded-md border-[1.5px] border-dashed border-line-strong px-4 py-6 text-center text-[12.5px] leading-normal text-faint">
                      {column.emptyHint}
                    </div>
                  ) : (
                    columnCards.map((cardItem) => (
                      <article key={cardItem.id} className="flex flex-col gap-2 rounded-md border border-line bg-white p-3.5 shadow-card">
                        <span className="font-mono text-[11px] tracking-[0.02em] text-faint">{cardItem.codigo}</span>
                        <div className="flex gap-1.5">
                          <span className={pillNeutral}>{cardItem.objeto}</span>
                          <span className={pillPrimary}>{cardItem.etapa}</span>
                        </div>
                        <span className="text-[11.5px] font-bold tracking-[0.02em] text-faint uppercase">{cardItem.entidad}</span>
                        <strong className="text-[13.5px] leading-snug font-semibold">{cardItem.titulo}</strong>
                        <span className="text-[14px] font-bold">{currency(cardItem.monto)}</span>
                        <select
                          className="mt-1 rounded-sm border border-line bg-canvas px-2 py-1.5 text-[12px] text-muted"
                          value={cardItem.estado}
                          onChange={(event) => moveCard(cardItem, event.target.value as PipelineEstado)}
                        >
                          {columns.map((option) => (
                            <option key={option.estado} value={option.estado}>
                              Mover a {option.label}
                            </option>
                          ))}
                        </select>
                      </article>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </section>
      </main>
    </div>
  )
}
