import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { RadarCard } from '../components/RadarCard'
import { useOnboarding } from '../context/OnboardingContext'
import { empresa, estadisticas, mensajeError, suscribirTelegram, terminos } from '../lib/api'
import { btn, btnPrimary, btnSecondary, card, container, dot, heading, mono, pill, pillNeutral, pillPrimary, pillSuccess, pillWarning } from '../lib/ui'
import type { AlertChannel, Company, KeywordSuggestion } from '../types/models'

type Block =
  | { id: string; kind: 'text'; from: 'lici' | 'user'; text: string }
  | { id: string; kind: 'typing' }
  | { id: string; kind: 'company'; company: Company; resolved: boolean }
  | { id: string; kind: 'keywords'; items: KeywordSuggestion[]; resolved: boolean }
  | { id: string; kind: 'alerts'; resolved: boolean; selected: AlertChannel | null }
  | { id: string; kind: 'telegram'; url: string; botUsername: string }
  | { id: string; kind: 'done' }

let blockSeq = 0
const nextId = () => `b${++blockSeq}`

function textBlock(from: 'lici' | 'user', text: string): Block {
  return { id: nextId(), kind: 'text', from, text }
}

const welcome: Block[] = [
  textBlock('lici', 'Hola Jorge. Te damos la bienvenida a Lici, el motor de inteligencia para contrataciones del Estado peruano.'),
  textBlock(
    'lici',
    'Para mapear licitaciones a tu medida en tiempo real, ingresa el RUC de tu empresa (11 dígitos). Validaremos automáticamente tu estado tributario en SUNAT y tu vigencia de registro en el RNP (OSCE).',
  ),
]

function withoutTyping(blocks: Block[]): Block[] {
  return blocks.filter((block) => block.kind !== 'typing')
}

function statusLabel(index: number, status: 'pending' | 'active' | 'done'): string {
  if (status === 'pending') return 'Pendiente'
  if (status === 'done') return index === 0 ? 'Validado' : 'Configurado'
  return index === 0 ? 'Esperando RUC' : 'En proceso'
}

function statusClass(index: number, status: 'pending' | 'active' | 'done'): string {
  if (status === 'pending') return pillNeutral
  if (status === 'done') return pillSuccess
  return index === 0 ? pillWarning : pillPrimary
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const state = useOnboarding()
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [inputValue, setInputValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [blocks, setBlocks] = useState<Block[]>(welcome)
  const [radar, setRadar] = useState({ convocatorias: '—', monto: '—' })

  useEffect(() => {
    state.reset()
    estadisticas()
      .then((stats) =>
        setRadar({
          convocatorias: stats.vigentes.toLocaleString('es-PE'),
          monto: 'S/ ' + (stats.montoVigente / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 1 }) + 'M',
        }),
      )
      .catch(() => undefined)
    // El onboarding de Angular reinicia el perfil al entrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [blocks])

  const sidebarSteps = useMemo(() => {
    const idxMap = { ruc: 0, keywords: 1, alerts: 2, done: 3 } as const
    const idx = idxMap[state.step]
    return ['Empresa', 'Rubro y keywords', 'Canal de alertas'].map((label, index) => ({
      label,
      status: index < idx ? ('done' as const) : index === idx ? ('active' as const) : ('pending' as const),
    }))
  }, [state.step])

  const placeholder =
    state.step === 'ruc'
      ? 'Escribe o pega tu RUC (11 dígitos)...'
      : state.step === 'keywords'
        ? 'Escribe una keyword para agregarla a la lista...'
        : state.step === 'alerts'
          ? 'Elige un canal de alertas arriba...'
          : 'Pregúntale a Lici (ej: añadir consorcios, bases tipo, montos)...'

  const push = (block: Block) => {
    setBlocks((current) => [...withoutTyping(current), block])
  }

  const pushUser = (text: string) => push(textBlock('user', text))
  const pushLici = (text: string) => push(textBlock('lici', text))

  const suggestRubro = () => {
    pushUser('Prefiero ingresar por rubro o CIIU')
    pushLici('Por ahora completa el proceso con tu RUC — la búsqueda manual por rubro/CIIU estará disponible muy pronto.')
  }

  const submitRuc = (raw: string) => {
    const ruc = raw.replace(/\D/g, '')
    pushUser(ruc)
    if (ruc.length !== 11) {
      pushLici('Ese RUC no parece válido. Debe tener 11 dígitos — revisa e inténtalo de nuevo.')
      return
    }
    setBusy(true)
    push({ id: nextId(), kind: 'typing' })
    empresa(ruc)
      .then((company) => {
        setBusy(false)
        state.setCompany(company)
        pushLici('Empresa localizada en la base tributaria (SUNAT vía API MIGO) y del RNP:')
        push({ id: nextId(), kind: 'company', company, resolved: false })
        for (const aviso of company.avisos) pushLici('⚠️ ' + aviso)
      })
      .catch((err: unknown) => {
        setBusy(false)
        setBlocks((current) => withoutTyping(current))
        pushLici(mensajeError(err, 'No pudimos validar ese RUC.') + ' Revisa el número e inténtalo de nuevo.')
      })
  }

  const addKeyword = (text: string) => {
    const label = text.toUpperCase()
    setBlocks((current) =>
      current.map((block) => {
        if (block.kind !== 'keywords' || block.resolved) return block
        if (block.items.some((item) => item.label === label)) return block
        return { ...block, items: [...block.items, { label, selected: true }] }
      }),
    )
  }

  const onSend = () => {
    const value = inputValue.trim()
    if (!value || busy) return
    if (state.step === 'ruc') submitRuc(value)
    else if (state.step === 'keywords') addKeyword(value)
    else {
      pushUser(value)
      pushLici('Anotado. Usa las opciones de arriba para continuar con el siguiente paso.')
    }
    setInputValue('')
  }

  const confirmCompany = (id: string) => {
    const block = blocks.find((item) => item.id === id && item.kind === 'company')
    if (!block || block.kind !== 'company' || block.resolved) return
    setBlocks((current) => current.map((item) => (item.id === id && item.kind === 'company' ? { ...item, resolved: true } : item)))
    pushUser('Sí, es correcta')
    const ciius = block.company.ciius.map((item) => item.codigo)
    if (!ciius.length) {
      pushLici('SUNAT no registra actividades económicas para esta empresa. Escribe tus keywords y las usaremos para buscar.')
      push({ id: nextId(), kind: 'keywords', items: [], resolved: false })
      return
    }
    setBusy(true)
    push({ id: nextId(), kind: 'typing' })
    terminos(ciius, 10)
      .then((list) => {
        setBusy(false)
        const items = list.map((item) => ({ label: item.termino, selected: item.licitaciones > 0, licitaciones: item.licitaciones }))
        pushLici(`Analizamos los términos más licitados en el SEACE para tu rubro (CIIU ${ciius.join(', ')}):`)
        push({ id: nextId(), kind: 'keywords', items, resolved: false })
      })
      .catch((err: unknown) => {
        setBusy(false)
        setBlocks((current) => withoutTyping(current))
        pushLici(mensajeError(err, 'No pudimos analizar los términos de tu rubro.') + ' Escribe tus keywords manualmente.')
        push({ id: nextId(), kind: 'keywords', items: [], resolved: false })
      })
  }

  const rejectCompany = (id: string) => {
    setBlocks((current) => current.map((item) => (item.id === id && item.kind === 'company' ? { ...item, resolved: true } : item)))
    pushUser('No, otro RUC')
    state.reset()
    pushLici('Sin problema. Ingresa el RUC correcto y lo validamos de nuevo.')
  }

  const toggleKeyword = (blockId: string, label: string) => {
    setBlocks((current) =>
      current.map((block) => {
        if (block.id !== blockId || block.kind !== 'keywords' || block.resolved) return block
        return { ...block, items: block.items.map((item) => (item.label === label ? { ...item, selected: !item.selected } : item)) }
      }),
    )
  }

  const confirmKeywords = (id: string) => {
    const block = blocks.find((item) => item.id === id && item.kind === 'keywords')
    if (!block || block.kind !== 'keywords') return
    const chosen = block.items.filter((item) => item.selected)
    if (!chosen.length) {
      pushLici('Selecciona al menos una keyword (o escribe una en el chat) para continuar.')
      return
    }
    setBlocks((current) => current.map((item) => (item.id === id && item.kind === 'keywords' ? { ...item, resolved: true } : item)))
    pushUser('Usar estas keywords')
    state.confirmKeywords(chosen)
    pushLici('Último paso: ¿cómo quieres que te avisemos cuando salga algo nuevo?')
    push({ id: nextId(), kind: 'alerts', resolved: false, selected: null })
  }

  const finish = (channel: AlertChannel) => {
    state.confirmAlertChannel(channel)
    pushLici('¡Listo! Tu perfil quedó configurado. Ya puedes ver las licitaciones que encajan contigo en Descubrimiento.')
    push({ id: nextId(), kind: 'done' })
  }

  const chooseAlert = (id: string, channel: AlertChannel) => {
    setBlocks((current) =>
      current.map((item) => (item.id === id && item.kind === 'alerts' ? { ...item, resolved: true, selected: channel } : item)),
    )
    const label = channel === 'email' ? 'Email' : channel === 'whatsapp' ? 'WhatsApp' : 'Telegram'
    pushUser(label)
    if (channel !== 'telegram') {
      finish(channel)
      return
    }
    setBusy(true)
    push({ id: nextId(), kind: 'typing' })
    suscribirTelegram({
      ruc: state.company?.ruc ?? null,
      razonSocial: state.company?.razonSocial ?? null,
      keywords: state.selectedKeywords,
      ciius: state.ciius,
    })
      .then(() => {
        setBusy(false)
        pushLici('Canal registrado: Telegram. Las alertas las enviará n8n; no hace falta abrir un bot.')
        finish('telegram')
      })
      .catch((err: unknown) => {
        setBusy(false)
        setBlocks((current) =>
          withoutTyping(current).map((item) => (item.id === id && item.kind === 'alerts' ? { ...item, resolved: false, selected: null } : item)),
        )
        pushLici(mensajeError(err, 'No pudimos crear la suscripción de Telegram.') + ' Elige otro canal o inténtalo más tarde.')
      })
  }

  const channelLabel =
    state.alertChannel === 'email' ? 'Email: Resumen HTML Diario' : state.alertChannel === 'whatsapp' ? 'WhatsApp' : 'Telegram'

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="flex items-center justify-between border-b border-line bg-white px-8 py-3.5">
        <div className="flex items-center gap-3">
          <Link to="/" className={`${heading} text-[22px] font-semibold`}>
            Lici<span className="text-primary">.</span>
          </Link>
          <span className={pillPrimary}>ONBOARDING</span>
          <span className={pillNeutral}>PRO · CONTRATACIONES DEL ESTADO</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={pillNeutral}>
            <span className={dot} style={{ background: '#16a34a' }} />
            Perú • SEACE 3.0
          </span>
          <span className="text-[13px] text-muted">SUNAT Online</span>
          <Link to="/" className="text-[13px] font-semibold text-muted hover:text-danger">
            Salir
          </Link>
        </div>
      </header>

      <div className="flex items-center justify-between bg-navy px-8 py-2.5 text-[13px] text-[#cbd5e1]">
        <span>
          <span className={`${dot} mr-1.5`} style={{ background: '#34d399' }} />
          Servidor de Inteligencia Lici sincronizado con <strong className="text-white">OSCE, SEACE y SUNAT</strong>
        </span>
        <span className={`${pill} border border-[#34d399]/28 bg-[#34d399]/14 text-[#34d399]`}>✓ Conexión RNP Activa</span>
      </div>

      <main className={`${container} grid flex-1 grid-cols-[1.6fr_1fr] items-start gap-6 pt-7 pb-10 max-[1100px]:grid-cols-1`}>
        <section className={`${card} flex h-[calc(100vh-190px)] min-h-[560px] flex-col max-[1100px]:h-auto`}>
          <div className="flex items-center gap-3 border-b border-line px-[22px] py-[18px]">
            <div className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white">L</div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-2">
                <strong>Lici</strong>
                <span className={pillPrimary}>IA Especialista en Contrataciones</span>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                <span className={dot} style={{ background: '#16a34a' }} />
                En línea · te ayuda a configurar tu perfil
              </span>
            </div>
            <span className="shrink-0 text-xs text-faint">🔒 256-bit SSL</span>
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-[22px]">
            {blocks.map((block) => {
              if (block.kind === 'text') {
                const isUser = block.from === 'user'
                return (
                  <div key={block.id} className={`flex max-w-[88%] items-start gap-2.5 ${isUser ? 'max-w-[70%] flex-row-reverse self-end' : ''}`}>
                    {isUser ? null : <Avatar />}
                    <div
                      className={`rounded-md border px-4 py-[13px] text-[14.5px] leading-[1.55] ${
                        isUser ? 'border-primary bg-primary text-white' : 'border-line bg-white text-ink'
                      }`}
                    >
                      {block.text}
                    </div>
                  </div>
                )
              }
              if (block.kind === 'typing') {
                return (
                  <div key={block.id} className="flex items-start gap-2.5">
                    <Avatar />
                    <div className="inline-flex gap-1 rounded-md border border-line bg-white px-4 py-3.5" aria-label="Lici está consultando">
                      {[0, 1, 2].map((dotIndex) => (
                        <span
                          key={dotIndex}
                          className="size-1.5 animate-typing rounded-full bg-faint motion-reduce:animate-none"
                          style={{ animationDelay: `${dotIndex * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </div>
                )
              }
              if (block.kind === 'company') {
                const company = block.company
                return (
                  <div key={block.id} className="flex max-w-[88%] items-start gap-2.5">
                    <Avatar />
                    <div className="w-full rounded-md border border-line bg-white p-[18px] text-[14.5px] leading-[1.55]">
                      <div className="mb-3.5 flex justify-between gap-4 border-b border-line pb-3.5">
                        <div>
                          <span className="mb-1 block text-[10.5px] font-bold tracking-[0.04em] text-faint uppercase">Razón social registrada</span>
                          <strong className="text-[15px]">
                            {company.razonSocial}
                            {company.sunatOk ? ' ✓' : ''}
                          </strong>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="mb-1 block text-[10.5px] font-bold tracking-[0.04em] text-faint uppercase">RUC N°</span>
                          <strong>{company.ruc}</strong>
                        </div>
                      </div>
                      <div className="mb-3.5 grid grid-cols-3 gap-3.5">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10.5px] font-bold tracking-[0.04em] text-faint uppercase">Condición SUNAT</span>
                          <span className={company.sunatOk ? pillSuccess : `${pill} border border-danger-line bg-danger-soft text-danger`}>
                            {company.condicionSunat}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10.5px] font-bold tracking-[0.04em] text-faint uppercase">Registro RNP (OSCE)</span>
                          {company.rnpVigente ? (
                            <>
                              <span className={`${pillPrimary} self-start`}>VIGENTE</span>
                              <span className="text-xs text-muted">{company.tiposRnp.join(' · ') || 'Sin registros'}</span>
                            </>
                          ) : (
                            <span className={`${pillWarning} self-start`}>NO VIGENTE</span>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10.5px] font-bold tracking-[0.04em] text-faint uppercase">Rubro SEACE detectado</span>
                          <strong>{company.rubro}</strong>
                        </div>
                      </div>
                      {company.ciius.length > 1 ? (
                        <ul className="mb-3 text-[12.5px] text-muted">
                          {company.ciius.map((item) => (
                            <li key={item.codigo} className="mt-[3px] first:mt-0">
                              <span className={mono}>{item.codigo}</span> {item.descripcion} <em>· {item.tipo}</em>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <span className="mb-2.5 block text-[12.5px] text-muted">
                        📍 {company.ubicacion} · Capacidad máx. de contratación: {company.capacidadMaxima}
                      </span>
                      <p className="text-[13.5px] text-muted">¿Es la empresa con la que postularás a procesos de compra estatal?</p>
                      <div className="mt-3.5 flex flex-wrap gap-2.5">
                        <button className={block.resolved ? btnSecondary : btnPrimary} type="button" disabled={block.resolved} onClick={() => confirmCompany(block.id)}>
                          ✓ Sí, es correcta
                        </button>
                        <button className={btnSecondary} type="button" disabled={block.resolved} onClick={() => rejectCompany(block.id)}>
                          No, otro RUC
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }
              if (block.kind === 'keywords') {
                return (
                  <div key={block.id} className="flex max-w-[88%] items-start gap-2.5">
                    <Avatar />
                    <div className="w-full rounded-md border border-line bg-white p-[18px]">
                      <ul className="mb-3.5 flex flex-wrap gap-2">
                        {block.items.length === 0 ? (
                          <li className="text-[13px] text-muted">Aún no hay keywords: escribe una en el chat para agregarla.</li>
                        ) : (
                          block.items.map((item) => (
                            <li key={item.label}>
                              <button
                                type="button"
                                disabled={block.resolved}
                                onClick={() => toggleKeyword(block.id, item.label)}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-[7px] text-[12.5px] font-semibold tracking-[0.01em] disabled:cursor-default ${
                                  item.selected
                                    ? 'border-primary-line bg-primary-soft text-primary'
                                    : 'border-line-strong bg-white text-muted'
                                }`}
                              >
                                <span className="w-3.5 text-[11px]">{item.selected ? '✓' : ''}</span>
                                {item.label}
                                {item.licitaciones ? <span className="text-[11px] text-faint">{item.licitaciones} procesos</span> : null}
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                      <p className="text-[13.5px] text-muted">¿Las usamos para tu descubrimiento?</p>
                      <div className="mt-3.5 flex flex-wrap gap-2.5">
                        <button className={block.resolved ? btnSecondary : btnPrimary} type="button" disabled={block.resolved} onClick={() => confirmKeywords(block.id)}>
                          ✓ Usar estas keywords
                        </button>
                        <button className={btnSecondary} type="button" disabled={block.resolved} onClick={() => inputRef.current?.focus()}>
                          + Agregar otra keyword
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }
              if (block.kind === 'alerts') {
                return (
                  <div key={block.id} className="flex max-w-[88%] items-start gap-2.5">
                    <Avatar />
                    <div className="w-full rounded-md border border-line bg-white p-[18px]">
                      <ul className="mb-3.5 flex flex-col gap-2 text-[13.5px] text-muted">
                        <li className="relative pl-3.5 before:absolute before:left-0 before:text-primary before:content-['•']">
                          <strong>WhatsApp / Telegram:</strong> ingresas tu número o usuario y confirmas con un código
                        </li>
                        <li className="relative pl-3.5 before:absolute before:left-0 before:text-primary before:content-['•']">
                          <strong>Email:</strong> te mandamos un resumen HTML con oportunidades
                        </li>
                      </ul>
                      <div className="flex flex-wrap gap-2.5">
                        <button
                          className={block.selected === 'email' || !block.resolved ? btnPrimary : btnSecondary}
                          type="button"
                          disabled={block.resolved}
                          onClick={() => chooseAlert(block.id, 'email')}
                        >
                          ✉️ Email
                        </button>
                        <button className={btnSecondary} type="button" disabled={block.resolved} onClick={() => chooseAlert(block.id, 'whatsapp')}>
                          WhatsApp
                        </button>
                        <button className={btnSecondary} type="button" disabled={block.resolved} onClick={() => chooseAlert(block.id, 'telegram')}>
                          Telegram
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }
              if (block.kind === 'telegram') {
                return (
                  <div key={block.id} className="flex max-w-[88%] items-start gap-2.5">
                    <Avatar />
                    <div className="w-full rounded-md border border-line bg-white p-[18px]">
                      <strong className="mb-1.5 block text-base">📲 Activa tus alertas en Telegram</strong>
                      <p className="mb-3.5 text-muted">
                        Se abrirá el chat con <span className={mono}>@{block.botUsername}</span>. Pulsa «Iniciar» para confirmar.
                      </p>
                      <a className={btnPrimary} href={block.url} target="_blank" rel="noopener">
                        Abrir Telegram →
                      </a>
                    </div>
                  </div>
                )
              }
              return (
                <div key={block.id} className="flex max-w-[88%] items-start gap-2.5">
                  <Avatar />
                  <div className="w-full rounded-md border border-line bg-white p-[18px]">
                    <strong className="mb-1.5 block text-base">🎉 Perfil configurado al 100%</strong>
                    <p className="mb-3.5 text-muted">Ya estamos monitoreando SEACE con tus keywords y avisándote por el canal elegido.</p>
                    <button className={btnPrimary} type="button" onClick={() => navigate('/app/descubrimiento')}>
                      Ir a Descubrimiento →
                    </button>
                  </div>
                </div>
              )
            })}
            <div ref={scrollRef} />
          </div>

          <div className="border-t border-line px-[22px] pt-3.5 pb-[18px]">
            {state.step === 'ruc' ? (
              <button
                className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:border-primary hover:text-primary"
                type="button"
                onClick={suggestRubro}
              >
                ✎ Prefiero ingresar por rubro o CIIU
              </button>
            ) : null}
            <div className="flex items-center gap-2.5 rounded-md border border-line-strong py-1.5 pr-1.5 pl-3.5 focus-within:border-primary focus-within:shadow-[0_0_0_3px_var(--color-primary-soft)]">
              <input
                ref={inputRef}
                className="flex-1 border-none py-2 text-sm outline-none"
                type="text"
                disabled={busy}
                placeholder={placeholder}
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyUp={(event) => {
                  if (event.key === 'Enter') onSend()
                }}
              />
              <button className={`${btn} size-[34px] shrink-0 bg-primary p-0 text-white hover:bg-primary-dark`} type="button" onClick={onSend} aria-label="Enviar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div className="mt-2.5 flex justify-between text-[11.5px] text-faint">
              <span>Soporta RUC 10 y 20 (Personas Naturales y Jurídicas)</span>
              <span>✓ Búsqueda instantánea en padrón SUNAT</span>
            </div>
          </div>
        </section>

        <aside className="sticky top-[88px] flex flex-col gap-5 max-[1100px]:static">
          <div className={`${card} p-6`}>
            <span className="mb-2 block text-[11px] font-bold tracking-[0.05em] text-faint">TU PERFIL LICI</span>
            <h2 className={`${heading} mb-1.5 text-[21px]`}>Lo que vamos armando</h2>
            <p className="mb-[18px] text-[13px] text-muted">Revisa el panel: se actualiza mientras respondes el chat.</p>
            <ul className="mb-[22px] flex flex-col gap-2.5">
              {sidebarSteps.map((step, index) => (
                <li key={step.label} className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5">
                  <span
                    className={`inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      step.status === 'pending' ? 'bg-canvas text-faint' : 'bg-primary text-white'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="flex-1 text-[13.5px] font-semibold">{step.label}</span>
                  <span className={statusClass(index, step.status)}>{statusLabel(index, step.status)}</span>
                </li>
              ))}
            </ul>
            <span className="mb-2 block text-[11px] font-bold tracking-[0.05em] text-faint">PREVISUALIZACIÓN DE DATOS</span>
            <div className="mb-3 flex flex-col gap-1 rounded-md border border-dashed border-line-strong p-3.5">
              <div className="mb-1 flex items-center justify-between text-[11px] font-bold tracking-[0.03em] text-faint">
                <span>🏢 EMPRESA</span>
                {state.company ? (
                  <span className={state.company.sunatOk ? pillSuccess : pillWarning}>{state.company.sunatOk ? 'SUNAT OK' : 'REVISAR SUNAT'}</span>
                ) : null}
              </div>
              {state.company ? (
                <>
                  <strong>{state.company.razonSocial}</strong>
                  <span className="text-[12.5px] text-muted">RUC {state.company.ruc}</span>
                  <span className="text-[12.5px] text-muted">{state.company.ubicacion}</span>
                  <span className="text-[12.5px] text-muted">
                    Rubro detectado: <strong>{state.company.rubro}</strong>
                  </span>
                </>
              ) : (
                <span className="text-[12.5px] text-faint italic">Pega tu RUC en el chat para completar esto</span>
              )}
            </div>
            <div className="mb-3 flex flex-col gap-1 rounded-md border border-dashed border-line-strong p-3.5">
              <div className="mb-1 text-[11px] font-bold tracking-[0.03em] text-faint">🏷️ KEYWORDS</div>
              {state.selectedKeywords.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {state.selectedKeywords.map((keyword) => (
                    <span key={keyword} className={pillNeutral}>
                      {keyword}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-[12.5px] text-faint italic">Aparecerán sugerencias según tu rubro</span>
              )}
            </div>
            <div className="flex flex-col gap-1 rounded-md border border-dashed border-line-strong p-3.5">
              <div className="mb-1 text-[11px] font-bold tracking-[0.03em] text-faint">🔔 ALERTAS</div>
              {state.alertChannel ? (
                <>
                  <strong>{channelLabel}</strong>
                  <span className="text-[12.5px] text-muted">
                    {state.alertChannel === 'telegram'
                      ? 'Aviso apenas se publica una convocatoria que calce'
                      : 'Convocatorias coincidentes a primera hora'}
                  </span>
                </>
              ) : (
                <span className="text-[12.5px] text-faint italic">Sin definir aún</span>
              )}
            </div>
          </div>
          <RadarCard convocatorias={radar.convocatorias} monto={radar.monto} />
        </aside>
      </main>
    </div>
  )
}

function Avatar() {
  return (
    <div className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">L</div>
  )
}
