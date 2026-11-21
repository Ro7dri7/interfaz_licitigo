import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './components'

const dealUrl = (id: string) => new URL(`/negocios/${id}`, window.location.origin).href

// Menú del clic derecho sobre un negocio: abrirlo en otra pestaña o ventana, copiar el enlace o ver su resumen.
export default function DealContextMenu({ dealId, x, y, onClose, onPreview }: { dealId: string; x: number; y: number; onClose: () => void; onPreview: () => void }) {
  const ref = useRef<HTMLDivElement>(null), [copied, setCopied] = useState(false)
  const [pos, setPos] = useState({ left: x, top: y })
  useEffect(() => {
    const box = ref.current
    if (box) setPos({ left: Math.max(8, Math.min(x, window.innerWidth - box.offsetWidth - 8)), top: Math.max(8, Math.min(y, window.innerHeight - box.offsetHeight - 8)) })
    box?.querySelector<HTMLElement>('button')?.focus()
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const items = [...(box?.querySelectorAll<HTMLElement>('button') ?? [])], at = items.indexOf(document.activeElement as HTMLElement)
      items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
    }
    window.addEventListener('keydown', onKey); window.addEventListener('resize', close); window.addEventListener('blur', close); window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', close); window.removeEventListener('blur', close); window.removeEventListener('scroll', close, true) }
  }, [x, y, onClose])

  const url = dealUrl(dealId)
  const items: [string, string, () => void][] = [
    ['Abrir en una pestaña nueva', 'arrow', () => { window.open(url, '_blank', 'noopener'); onClose() }],
    ['Abrir en una ventana nueva', 'board', () => { window.open(url, '_blank', `popup=yes,noopener,width=${Math.min(1280, window.screen.availWidth)},height=${Math.min(860, window.screen.availHeight)}`); onClose() }],
    ['Ver resumen', 'file', () => { onPreview(); onClose() }],
    [copied ? 'Enlace copiado' : 'Copiar enlace', 'list', () => {
      navigator.clipboard?.writeText(url).then(() => { setCopied(true); window.setTimeout(onClose, 700) }, onClose)
    }],
  ]
  return createPortal(<>
    <div className="ctx-backdrop" onMouseDown={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
    <div ref={ref} className="ctx-menu" role="menu" aria-label="Acciones del negocio" style={pos}>
      {items.map(([label, icon, run]) => <button type="button" role="menuitem" key={label} onClick={run}><Icon name={icon} size={15} />{label}</button>)}
    </div></>, document.body)
}
