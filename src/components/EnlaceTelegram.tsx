import { useEffect, useRef, useState } from 'react'
import { btnGhost, btnPrimary, btnSecondary, mono } from '../lib/ui'
import type { TelegramLink } from '../types/models'

/**
 * Formas de abrir el bot con el enlace de la cuenta: app de Telegram, Telegram Web o, si ninguna abre (p. ej. PC
 * sin la app instalada), copiar el comando /start y pegarlo en el chat del bot.
 */
export function EnlaceTelegram({ enlace }: { enlace: TelegramLink }) {
  const [copiado, setCopiado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace.comando)
      setCopiado(true)
      timer.current = setTimeout(() => setCopiado(false), 2500)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        <a className={btnPrimary} href={enlace.url} target="_blank" rel="noopener noreferrer">
          Abrir en la app de Telegram
        </a>
        <a className={btnSecondary} href={enlace.urlWeb} target="_blank" rel="noopener noreferrer">
          Abrir en Telegram Web
        </a>
      </div>
      <p className="text-[13px] leading-normal text-muted">
        Se abrirá el chat con <span className={mono}>@{enlace.botUsername}</span>: pulsa <strong>Iniciar</strong>. Si no
        abre, busca <span className={mono}>@{enlace.botUsername}</span> en Telegram y envíale este mensaje:
      </p>
      <div className="flex items-center justify-between gap-2 rounded-sm border border-line bg-canvas py-1.5 pr-1.5 pl-3">
        <code className={`${mono} text-[13px] [overflow-wrap:anywhere]`}>{enlace.comando}</code>
        <button type="button" className={`${btnGhost} shrink-0 px-2.5! py-1.5! text-[12.5px]!`} onClick={copiar}>
          {copiado ? '✓ Copiado' : 'Copiar'}
        </button>
      </div>
      <p className="text-[12px] leading-normal text-faint">
        El enlace sirve una sola vez y vence en 24 horas. Las alertas usan el RUC y las keywords de tu cuenta.
      </p>
    </div>
  )
}
