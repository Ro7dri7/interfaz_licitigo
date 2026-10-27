import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EnlaceTelegram } from '../components/EnlaceTelegram'
import { RadarCard } from '../components/RadarCard'
import { useOnboarding } from '../context/OnboardingContext'
import * as api from '../lib/api'
import { mensajeError } from '../lib/api'
import { logout, nombreCorto, obtenerSesion } from '../lib/auth'
import {
  btnPrimary,
  btnSecondary,
  card,
  container,
  dot,
  mono,
  pill,
  pillDanger,
  pillNeutral,
  pillPrimary,
  pillSuccess,
  pillWarning,
} from '../lib/ui'
import type { AlertChannel, Company, KeywordSuggestion, TelegramLink } from '../types/models'

type BlockData =
  | { kind: 'text'; from: 'lici' | 'user'; text: string }
  | { kind: 'typing' }
  | { kind: 'company'; company: Company; resolved: boolean; bloqueada?: boolean }
  | { kind: 'keywords'; items: KeywordSuggestion[]; resolved: boolean }
  | { kind: 'alerts'; resolved: boolean; selected: AlertChannel | null }
  | { kind: 'telegram'; link: TelegramLink }
  | { kind: 'done' }
  | { kind: 'configurado'; company: Company | null; ruc: string; keywords: number; resolved: boolean }

type Block = BlockData & { id: number }
type Of<K extends Block['kind']> = Extract<Block, { kind: K }>
type StepStatus = 'pending' | 'active' | 'done'

let siguienteId = 0

function statusLabel(i: number, status: StepStatus): string {
  if (status === 'pending') return 'Pendiente'
  if (status === 'done') return i === 0 ? 'Validado' : 'Configurado'
  return i === 0 ? 'Esperando RUC' : 'En proceso'
}

function statusClass(i: number, status: StepStatus): string {
  if (status === 'pending') return pillNeutral
  if (status === 'done') return pillSuccess
  return i === 0 ? pillWarning : pillPrimary
}

// ----------------------------------------------------------------------------- estilos

const msgAvatar =
  'mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-white'
const bubble = 'rounded-md border border-line bg-white px-4 py-[13px] text-[14.5px] leading-[1.55] text-ink'
const bubbleRich = `${bubble} w-full p-[18px]!`
const actions = 'mt-3.5 flex flex-wrap gap-2.5'
const ccLabel = 'mb-1 block text-[10.5px] font-bold tracking-[0.04em] text-faint uppercase'
const ccMeta = 'mb-2.5 block text-[12.5px] text-muted'
const question = 'text-[13.5px] text-muted'
const doneTitle = 'mb-1.5 block text-[16px]'
const doneText = 'mb-3.5 text-muted'
const previewBlock = 'mb-3 flex flex-col gap-1 rounded-md border border-dashed border-line-strong p-3.5'
const previewHead = 'mb-1 flex items-center justify-between text-[11px] font-bold tracking-[0.03em] text-faint'
const previewMeta = 'text-[12.5px] text-muted'
const previewEmpty = 'text-[12.5px] text-faint italic'
const eyebrow = 'mb-2 block text-[11px] font-bold tracking-[0.05em] text-faint'

function LiciMsg({ children }: { children: ReactNode }) {
  return (
    <div className="flex max-w-[88%] items-start gap-2.5">
      <div className={msgAvatar}>L</div>
      {children}
    </div>
  )
}

export function OnboardingPage() {
  const state = useOnboarding()
  const navigate = useNavigate()

  const [inputValue, setInputValue] = useState('')
  // Empieza ocupado: al entrar se consulta el perfil de la cuenta
  const [busy, setBusy] = useState(true)
  const [blocks, setBlocks] = useState<Block[]>(() => {
    const nombre = nombreCorto(obtenerSesion())
    return [
      {
        id: siguienteId++,
        kind: 'text',
        from: 'lici',
        text: `Hola${nombre ? ' ' + nombre : ''}. Te damos la bienvenida a LiciHub, el motor de inteligencia para contrataciones del Estado peruano.`,
      },
    ]
  })
  const [radar, setRadar] = useState({ convocatorias: '—', monto: '—' })

  const blocksRef = useRef(blocks)
  useEffect(() => {
    blocksRef.current = blocks
  }, [blocks])
  const scrollPendiente = useRef(false)
  const scrollAnchor = useRef<HTMLDivElement>(null)
  const chatInput = useRef<HTMLInputElement>(null)

  const push = (block: BlockData) => {
    setBlocks((b) => [...b.filter((x) => x.kind !== 'typing'), { ...block, id: siguienteId++ } as Block])
    scrollPendiente.current = true
  }
  const pushUserText = (text: string) => push({ kind: 'text', from: 'user', text })
  const pushLici = (text: string) => push({ kind: 'text', from: 'lici', text })
  const stopTyping = () => setBlocks((b) => b.filter((x) => x.kind !== 'typing'))
  const actualizar = <K extends Block['kind']>(id: number, cambios: Partial<Of<K>>) =>
    setBlocks((b) => b.map((x) => (x.id === id ? ({ ...x, ...cambios } as Block) : x)))

  const pedirRuc = () =>
    pushLici(
      'Para mapear licitaciones a tu medida en tiempo real, ingresa el RUC de tu empresa (11 dígitos). Validaremos automáticamente tu estado tributario en SUNAT y tu vigencia de registro en el RNP (OSCE).',
    )

  /**
   * La cuenta queda ligada a una sola empresa. Si ya la tiene configurada se ofrece ir a Descubrimiento; si tiene
   * RUC pero le faltan keywords, se retoma desde su empresa (sin opción de cambiarla).
   */
  useEffect(() => {
    let vigente = true
    state.reset()
    api
      .estadisticas()
      .then((s) => {
        if (!vigente) return
        setRadar({
          convocatorias: s.vigentes.toLocaleString('es-PE'),
          monto: 'S/ ' + (s.montoVigente / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 1 }) + 'M',
        })
      })
      .catch(() => {})

    api
      .perfil()
      .then((p) => {
        if (!vigente) return
        setBusy(false)
        if (p.ruc && p.keywords.length) {
          push({ kind: 'configurado', company: p.empresa, ruc: p.ruc, keywords: p.keywords.length, resolved: false })
        } else if (p.ruc && p.empresa) {
          state.setCompany(p.empresa)
          pushLici('Tu cuenta está registrada con esta empresa. Confírmala para elegir tus keywords:')
          push({ kind: 'company', company: p.empresa, resolved: false, bloqueada: true })
        } else {
          pedirRuc()
        }
      })
      .catch(() => {
        if (!vigente) return
        setBusy(false)
        pedirRuc()
      })
    return () => {
      vigente = false
    }
    // Solo al entrar a la página (el contexto cambia en cada paso y no debe reiniciarla)
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (scrollPendiente.current) {
      scrollAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      scrollPendiente.current = false
    }
  }, [blocks])

  const idxMap = { ruc: 0, keywords: 1, alerts: 2, done: 3 } as const
  const idx = idxMap[state.step]
  const sidebarSteps = ['Empresa', 'Rubro y keywords', 'Canal de alertas'].map((label, i) => ({
    label,
    status: (i < idx ? 'done' : i === idx ? 'active' : 'pending') as StepStatus,
  }))

  const placeholder = (() => {
    switch (state.step) {
      case 'ruc':
        return 'Escribe o pega tu RUC (11 dígitos)...'
      case 'keywords':
        return 'Escribe una keyword para agregarla a la lista...'
      case 'alerts':
        return 'Elige un canal de alertas arriba...'
      default:
        return 'Pregúntale a LiciHub (ej: añadir consorcios, bases tipo, montos)...'
    }
  })()

  const suggestRubro = () => {
    pushUserText('Prefiero ingresar por rubro o CIIU')
    pushLici('Por ahora completa el proceso con tu RUC — la búsqueda manual por rubro/CIIU estará disponible muy pronto.')
  }

  const onSend = () => {
    const value = inputValue.trim()
    if (!value || busy) return
    setInputValue('')

    if (state.step === 'ruc') {
      submitRuc(value)
    } else if (state.step === 'keywords') {
      addKeyword(value)
    } else {
      pushUserText(value)
      pushLici('Anotado. Usa las opciones de arriba para continuar con el siguiente paso.')
    }
  }

  const submitRuc = (rucRaw: string) => {
    const ruc = rucRaw.replace(/\D/g, '')
    pushUserText(ruc)

    if (ruc.length !== 11) {
      pushLici('Ese RUC no parece válido. Debe tener 11 dígitos — revisa e inténtalo de nuevo.')
      return
    }

    setBusy(true)
    push({ kind: 'typing' })
    api
      .empresa(ruc)
      .then((company) => {
        setBusy(false)
        state.setCompany(company)
        pushLici('Empresa localizada en la base tributaria (SUNAT vía API MIGO) y del RNP:')
        push({ kind: 'company', company, resolved: false })
        for (const aviso of company.avisos) pushLici('⚠️ ' + aviso)
      })
      .catch((err) => {
        setBusy(false)
        stopTyping()
        pushLici(mensajeError(err, 'No pudimos validar ese RUC.') + ' Revisa el número e inténtalo de nuevo.')
      })
  }

  const confirmCompany = (block: Of<'company'>) => {
    if (busy) return
    pushUserText('Sí, es correcta')
    setBusy(true)
    push({ kind: 'typing' })

    // Se guarda el RUC en la cuenta: es el que usa el análisis con IA al desbloquear licitaciones.
    api
      .guardarPerfil({ ruc: block.company.ruc })
      .then(() => {
        actualizar<'company'>(block.id, { resolved: true })
        sugerirKeywords(block.company)
      })
      .catch((err) => {
        setBusy(false)
        stopTyping()
        pushLici(mensajeError(err, 'No pudimos guardar tu empresa.') + ' Pulsa «Sí, es correcta» para reintentar.')
      })
  }

  const sugerirKeywords = (company: Company) => {
    const ciius = company.ciius.map((c) => c.codigo)
    api
      .terminos(ciius, company.ruc, 12)
      .then((terminos) => {
        setBusy(false)
        const items: KeywordSuggestion[] = terminos.map((t) => ({
          label: t.termino,
          selected: t.vigentes > 0,
          licitaciones: t.licitaciones,
          abiertas: t.vigentes,
          historial: t.historial,
        }))
        if (!items.length) {
          pushLici('No encontramos términos licitados para tu rubro todavía. Escribe tus keywords en el chat (ej: «cemento portland»).')
        } else {
          const actividades = ciius.length ? ` (CIIU ${ciius.join(', ')})` : ''
          pushLici(
            `Estos son los ítems CUBSO más pedidos en el SEACE para tu rubro${actividades}` +
              (terminos.some((t) => t.rubroHistorial) ? ', priorizando el rubro de tu historial de postulaciones' : '') +
              '. Marcamos los que hoy tienen licitaciones abiertas; los ★ son ítems a los que ya postulaste. ' +
              'Puedes quitar o escribir otras en el chat:',
          )
        }
        push({ kind: 'keywords', items, resolved: false })
      })
      .catch((err) => {
        setBusy(false)
        stopTyping()
        pushLici(mensajeError(err, 'No pudimos analizar los términos de tu rubro.') + ' Escribe tus keywords manualmente.')
        push({ kind: 'keywords', items: [], resolved: false })
      })
  }

  const rejectCompany = (block: Of<'company'>) => {
    actualizar<'company'>(block.id, { resolved: true })
    pushUserText('No, otro RUC')
    state.volverARuc()
    pushLici('Sin problema. Ingresa el RUC correcto y lo validamos de nuevo.')
  }

  const pendingKeywordsBlock = (): Of<'keywords'> | undefined =>
    blocksRef.current.find((b): b is Of<'keywords'> => b.kind === 'keywords' && !b.resolved)

  const setItems = (id: number, fn: (items: KeywordSuggestion[]) => KeywordSuggestion[]) =>
    setBlocks((b) => b.map((x) => (x.id === id && x.kind === 'keywords' ? { ...x, items: fn(x.items) } : x)))

  const addKeyword = (text: string) => {
    const block = pendingKeywordsBlock()
    if (!block) return
    const label = text.replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 80)
    if (label.length < 3) {
      pushLici('La keyword debe tener al menos 3 letras.')
      return
    }
    if (block.items.some((i) => i.label === label)) {
      setItems(block.id, (items) => items.map((i) => (i.label === label ? { ...i, selected: true } : i)))
      return
    }
    if (block.items.filter((i) => i.selected).length >= 30) {
      pushLici('Puedes tener hasta 30 keywords. Desmarca alguna para agregar otra.')
      return
    }
    setItems(block.id, (items) => [...items, { label, selected: true, manual: true }])
    scrollPendiente.current = true
    api
      .conteoKeyword(label)
      .then((r) => {
        setItems(block.id, (items) => items.map((i) => (i.label === label ? { ...i, abiertas: r.abiertas } : i)))
        if (r.abiertas === 0) {
          pushLici(`Hoy no hay licitaciones abiertas con «${label}». La guardamos igual para avisarte cuando salga una.`)
        }
      })
      .catch(() => {
        /* el conteo es informativo */
      })
  }

  const toggleKeyword = (block: Of<'keywords'>, item: KeywordSuggestion) => {
    if (block.resolved) return
    setItems(block.id, (items) => items.map((i) => (i.label === item.label ? { ...i, selected: !i.selected } : i)))
  }

  const confirmKeywords = (block: Of<'keywords'>) => {
    if (busy) return
    const elegidas = block.items.filter((i) => i.selected)
    if (!elegidas.length) {
      pushLici('Selecciona al menos una keyword (o escribe una en el chat) para continuar.')
      return
    }
    setBusy(true)
    api
      .guardarPerfil({ keywords: elegidas.map((i) => i.label) })
      .then(() => {
        setBusy(false)
        actualizar<'keywords'>(block.id, { resolved: true })
        pushUserText('Usar estas keywords')
        state.confirmKeywords(elegidas)
        pushLici('Último paso: ¿cómo quieres que te avisemos cuando salga algo nuevo?')
        push({ kind: 'alerts', resolved: false, selected: null })
      })
      .catch((err) => {
        setBusy(false)
        pushLici(mensajeError(err, 'No pudimos guardar tus keywords.') + ' Inténtalo de nuevo.')
      })
  }

  const chooseAlertChannel = (block: Of<'alerts'>, channel: AlertChannel) => {
    actualizar<'alerts'>(block.id, { resolved: true, selected: channel })

    const label = channel === 'email' ? 'Email' : channel === 'whatsapp' ? 'WhatsApp' : 'Telegram'
    pushUserText(label)

    if (channel !== 'telegram') {
      finish(channel)
      return
    }

    setBusy(true)
    push({ kind: 'typing' })
    // El enlace usa el RUC y las keywords guardados en la cuenta (no los envía el navegador).
    api
      .suscribirTelegram()
      .then((link) => {
        setBusy(false)
        pushLici('Abre Telegram y pulsa «Iniciar»: el bot confirmará tu suscripción y te mostrará las licitaciones abiertas.')
        push({ kind: 'telegram', link })
        finish('telegram')
      })
      .catch((err) => {
        setBusy(false)
        stopTyping()
        actualizar<'alerts'>(block.id, { resolved: false, selected: null })
        pushLici(mensajeError(err, 'No pudimos crear la suscripción de Telegram.') + ' Elige otro canal o inténtalo más tarde.')
      })
  }

  const finish = (channel: AlertChannel) => {
    state.confirmAlertChannel(channel)
    pushLici('¡Listo! Tu perfil quedó configurado. Ya puedes ver las licitaciones que encajan contigo en Descubrimiento.')
    push({ kind: 'done' })
  }

  const irADescubrimiento = () => navigate('/app/descubrimiento')

  const renderBlock = (block: Block) => {
    switch (block.kind) {
      case 'text':
        return block.from === 'user' ? (
          <div className="flex max-w-[70%] flex-row-reverse items-start gap-2.5 self-end">
            <div className={`${bubble} border-primary! bg-primary! text-white!`}>{block.text}</div>
          </div>
        ) : (
          <LiciMsg>
            <div className={bubble}>{block.text}</div>
          </LiciMsg>
        )
      case 'typing':
        return (
          <LiciMsg>
            <div className={`${bubble} inline-flex gap-1 px-4! py-3.5!`} aria-label="LiciHub está consultando">
              {[0, 0.15, 0.3].map((delay) => (
                <span
                  key={delay}
                  className="size-1.5 animate-typing rounded-full bg-faint motion-reduce:animate-none"
                  style={{ animationDelay: `${delay}s` }}
                />
              ))}
            </div>
          </LiciMsg>
        )
      case 'company': {
        const c = block.company
        return (
          <LiciMsg>
            <div className={bubbleRich}>
              <div className="mb-3.5 flex justify-between gap-4 border-b border-line pb-3.5">
                <div>
                  <span className={ccLabel}>Razón social registrada</span>
                  <strong className="text-[15px]">
                    {c.razonSocial}
                    {c.sunatOk ? ' ✓' : ''}
                  </strong>
                </div>
                <div className="shrink-0 text-right">
                  <span className={ccLabel}>RUC N°</span>
                  <strong>{c.ruc}</strong>
                </div>
              </div>
              <div className="mb-3.5 grid grid-cols-3 gap-3.5 [&>div]:flex [&>div]:flex-col [&>div]:gap-1">
                <div>
                  <span className={ccLabel}>Condición SUNAT</span>
                  <span className={`${c.sunatOk ? pillSuccess : pillDanger} self-start`}>{c.condicionSunat}</span>
                </div>
                <div>
                  <span className={ccLabel}>Registro RNP (OSCE)</span>
                  {c.rnpVigente ? (
                    <>
                      <span className={`${pillPrimary} self-start`}>VIGENTE</span>
                      <span className="text-[12px] text-muted">{c.tiposRnp.join(' · ') || 'Sin registros'}</span>
                    </>
                  ) : (
                    <span className={`${pillWarning} self-start`}>NO VIGENTE</span>
                  )}
                </div>
                <div>
                  <span className={ccLabel}>Rubro SEACE detectado</span>
                  <strong>{c.rubro}</strong>
                </div>
              </div>
              {c.ciius.length > 1 ? (
                <ul className="mb-3 text-[12.5px] text-muted [&>li+li]:mt-[3px]">
                  {c.ciius.map((ci) => (
                    <li key={ci.codigo}>
                      <span className={mono}>{ci.codigo}</span> {ci.descripcion} <em>· {ci.tipo}</em>
                    </li>
                  ))}
                </ul>
              ) : null}
              <span className={ccMeta}>
                📍 {c.ubicacion} · Capacidad máx. de contratación: {c.capacidadMaxima}
              </span>
              <p className={question}>¿Es la empresa con la que postularás a procesos de compra estatal?</p>
              <span className={ccMeta}>Tu cuenta quedará ligada a esta empresa; luego no se podrá cambiar.</span>
              <div className={actions}>
                <button
                  className={block.resolved ? btnSecondary : btnPrimary}
                  disabled={block.resolved || busy}
                  onClick={() => confirmCompany(block)}
                >
                  ✓ Sí, es correcta
                </button>
                {!block.bloqueada ? (
                  <button className={btnSecondary} disabled={block.resolved || busy} onClick={() => rejectCompany(block)}>
                    No, otro RUC
                  </button>
                ) : null}
              </div>
            </div>
          </LiciMsg>
        )
      }
      case 'keywords':
        return (
          <LiciMsg>
            <div className={bubbleRich}>
              <ul className="mb-3.5 flex flex-wrap gap-2">
                {block.items.length ? (
                  block.items.map((item) => (
                    <li key={item.label}>
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-[7px] text-[12.5px] font-semibold tracking-[0.01em] disabled:cursor-default ${
                          item.selected
                            ? 'border-primary-line bg-primary-soft text-primary'
                            : 'border-line-strong bg-white text-muted'
                        }`}
                        disabled={block.resolved}
                        onClick={() => toggleKeyword(block, item)}
                      >
                        <span className="w-3.5 text-[11px]">{item.selected ? '✓' : ''}</span>
                        {item.label}
                        {item.abiertas !== undefined ? (
                          <span className={`text-[11px] ${item.abiertas ? 'font-semibold text-success' : 'font-medium text-faint'}`}>
                            {item.abiertas} abierta{item.abiertas === 1 ? '' : 's'}
                          </span>
                        ) : item.manual ? (
                          <span className="text-[11px] font-semibold text-success">contando…</span>
                        ) : null}
                        {item.historial ? (
                          <span
                            className="text-[11px] font-semibold text-warning"
                            title="Tu empresa ya postuló a procesos que pedían este ítem"
                          >
                            ★ En tu historial
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="text-[13px] text-muted">Aún no hay keywords: escribe una en el chat para agregarla.</li>
                )}
              </ul>
              <p className={question}>¿Las usamos para tu descubrimiento?</p>
              <div className={actions}>
                <button
                  className={block.resolved ? btnSecondary : btnPrimary}
                  disabled={block.resolved || busy}
                  onClick={() => confirmKeywords(block)}
                >
                  ✓ Usar estas keywords
                </button>
                <button className={btnSecondary} disabled={block.resolved} onClick={() => chatInput.current?.focus()}>
                  + Agregar otra keyword
                </button>
              </div>
            </div>
          </LiciMsg>
        )
      case 'alerts': {
        const emailPrimario = block.selected === 'email' || !block.resolved
        return (
          <LiciMsg>
            <div className={bubbleRich}>
              <ul className="mb-3.5 flex flex-col gap-2 text-[13.5px] text-muted [&>li]:relative [&>li]:pl-3.5 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:text-primary [&>li]:before:content-['•']">
                <li>
                  <strong>WhatsApp / Telegram:</strong> ingresas tu número o usuario y confirmas con un código
                </li>
                <li>
                  <strong>Email:</strong> te mandamos un resumen HTML con oportunidades
                </li>
              </ul>
              <div className={actions}>
                <button
                  className={emailPrimario ? btnPrimary : btnSecondary}
                  disabled={block.resolved}
                  onClick={() => chooseAlertChannel(block, 'email')}
                >
                  ✉️ Email
                </button>
                <button className={btnSecondary} disabled={block.resolved} onClick={() => chooseAlertChannel(block, 'whatsapp')}>
                  WhatsApp
                </button>
                <button className={btnSecondary} disabled={block.resolved} onClick={() => chooseAlertChannel(block, 'telegram')}>
                  Telegram
                </button>
              </div>
            </div>
          </LiciMsg>
        )
      }
      case 'telegram':
        return (
          <LiciMsg>
            <div className={`${bubbleRich} text-left`}>
              <strong className={doneTitle}>📲 Activa tus alertas en Telegram</strong>
              <EnlaceTelegram enlace={block.link} />
            </div>
          </LiciMsg>
        )
      case 'configurado':
        return (
          <LiciMsg>
            <div className={`${bubbleRich} text-left`}>
              <strong className={doneTitle}>✅ Tu empresa ya está configurada</strong>
              <p className={doneText}>
                {block.company?.razonSocial || 'RUC ' + block.ruc} · RUC {block.ruc} · {block.keywords} keyword
                {block.keywords === 1 ? '' : 's'}.
              </p>
              <div className={actions}>
                <button className={btnPrimary} disabled={block.resolved} onClick={irADescubrimiento}>
                  Ir a Descubrimiento →
                </button>
              </div>
            </div>
          </LiciMsg>
        )
      case 'done':
        return (
          <LiciMsg>
            <div className={`${bubbleRich} text-left`}>
              <strong className={doneTitle}>🎉 Perfil configurado al 100%</strong>
              <p className={doneText}>Ya estamos monitoreando SEACE con tus keywords y avisándote por el canal elegido.</p>
              <button className={btnPrimary} onClick={irADescubrimiento}>
                Ir a Descubrimiento →
              </button>
            </div>
          </LiciMsg>
        )
    }
  }

  const company = state.company
  const channel = state.alertChannel

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="flex items-center justify-between border-b border-line bg-white px-8 py-3.5">
        <div className="flex items-center gap-3">
          <Link to="/" className="font-serif text-[22px] font-semibold">
            LiciHub<span className="text-primary">.</span>
          </Link>
          <span className={pillPrimary}>ONBOARDING</span>
          <span className={pillNeutral}>PRO · CONTRATACIONES DEL ESTADO</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={pillNeutral}>
            <span className={dot} style={{ background: 'var(--color-success)' }} />
            Perú • SEACE 3.0
          </span>
          <span className="text-[13px] text-muted">SUNAT Online</span>
          <button
            type="button"
            className="border-none bg-transparent p-0 text-[13px] font-semibold text-muted hover:text-danger"
            onClick={() => logout()}
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <div className="flex items-center justify-between bg-navy px-8 py-2.5 text-[13px] text-[#cbd5e1]">
        <span>
          <span className={dot} style={{ background: '#34d399' }} /> Servidor de Inteligencia LiciHub sincronizado con{' '}
          <strong className="text-white">OSCE, SEACE y SUNAT</strong>
        </span>
        <span className={`${pill} border border-[rgba(52,211,153,0.28)] bg-[rgba(52,211,153,0.14)] text-[#34d399]`}>
          ✓ Conexión RNP Activa
        </span>
      </div>

      <main className={`${container} grid flex-1 grid-cols-[1.6fr_1fr] items-start gap-6 pt-7 pb-10 max-[1100px]:grid-cols-[1fr]`}>
        <section className={`${card} flex h-[calc(100vh-190px)] min-h-[560px] flex-col max-[1100px]:h-auto`}>
          <div className="flex items-center gap-3 border-b border-line px-[22px] py-[18px]">
            <div className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white">
              L
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-2">
                <strong>LiciHub</strong>
                <span className={pillPrimary}>IA Especialista en Contrataciones</span>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                <span className={dot} style={{ background: 'var(--color-success)' }} />
                En línea · te ayuda a configurar tu perfil
              </span>
            </div>
            <span className="shrink-0 text-[12px] text-faint">🔒 256-bit SSL</span>
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-[22px]">
            {blocks.map((block) => (
              <Fragment key={block.id}>{renderBlock(block)}</Fragment>
            ))}
            <div ref={scrollAnchor} />
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
                ref={chatInput}
                className="flex-1 border-none bg-transparent py-2 text-[14px] outline-none"
                type="text"
                disabled={busy}
                placeholder={placeholder}
                name="chatInput"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyUp={(e) => {
                  if (e.key === 'Enter') onSend()
                }}
              />
              <button
                className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-sm border-none bg-primary text-white hover:bg-primary-dark"
                type="button"
                disabled={busy}
                onClick={onSend}
                aria-label="Enviar"
              >
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
            <span className={eyebrow}>TU PERFIL LICI</span>
            <h2 className="mb-1.5 text-[21px]">Lo que vamos armando</h2>
            <p className="mb-[18px] text-[13px] text-muted">Revisa el panel: se actualiza mientras respondes el chat.</p>

            <ul className="mb-[22px] flex flex-col gap-2.5">
              {sidebarSteps.map((step, i) => (
                <li key={step.label} className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5">
                  <span
                    className={`inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                      step.status !== 'pending' ? 'bg-primary text-white' : 'bg-canvas text-faint'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 text-[13.5px] font-semibold">{step.label}</span>
                  <span className={statusClass(i, step.status)}>{statusLabel(i, step.status)}</span>
                </li>
              ))}
            </ul>

            <span className={eyebrow}>PREVISUALIZACIÓN DE DATOS</span>

            <div className={previewBlock}>
              <div className={previewHead}>
                <span>🏢 EMPRESA</span>
                {company ? (
                  <span className={company.sunatOk ? pillSuccess : pillWarning}>
                    {company.sunatOk ? 'SUNAT OK' : 'REVISAR SUNAT'}
                  </span>
                ) : null}
              </div>
              {company ? (
                <>
                  <strong>{company.razonSocial}</strong>
                  <span className={previewMeta}>RUC {company.ruc}</span>
                  <span className={previewMeta}>{company.ubicacion}</span>
                  <span className={previewMeta}>
                    Rubro detectado: <strong>{company.rubro}</strong>
                  </span>
                </>
              ) : (
                <span className={previewEmpty}>Pega tu RUC en el chat para completar esto</span>
              )}
            </div>

            <div className={previewBlock}>
              <div className={previewHead}>
                <span>🏷️ KEYWORDS</span>
              </div>
              {state.selectedKeywords.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {state.selectedKeywords.map((kw) => (
                    <span key={kw} className={pillNeutral}>
                      {kw}
                    </span>
                  ))}
                </div>
              ) : (
                <span className={previewEmpty}>Aparecerán sugerencias según tu rubro</span>
              )}
            </div>

            <div className={previewBlock}>
              <div className={previewHead}>
                <span>🔔 ALERTAS</span>
              </div>
              {channel ? (
                <>
                  <strong>
                    {channel === 'email' ? 'Email: Resumen HTML Diario' : channel === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
                  </strong>
                  <span className={previewMeta}>
                    {channel === 'telegram'
                      ? 'Aviso apenas se publica una convocatoria que calce'
                      : 'Convocatorias coincidentes a primera hora'}
                  </span>
                </>
              ) : (
                <span className={previewEmpty}>Sin definir aún</span>
              )}
            </div>
          </div>

          <RadarCard convocatorias={radar.convocatorias} monto={radar.monto} />
        </aside>
      </main>
    </div>
  )
}
