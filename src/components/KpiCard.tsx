import type { ReactNode } from 'react'
import { card } from '../lib/ui'

interface KpiCardProps {
  label: string
  value: string
  hint?: string
  valueColor?: string
  children?: ReactNode
}

export function KpiCard({ label, value, hint, valueColor, children }: KpiCardProps) {
  return (
    <div className={`${card} flex min-w-0 flex-col gap-1.5 px-5 py-[18px]`}>
      <span className="text-[11px] font-bold tracking-[0.05em] text-faint uppercase">{label}</span>
      <strong className="font-sans text-[26px] leading-[1.2] font-bold text-ink" style={{ color: valueColor }}>
        {value}
      </strong>
      {hint ? <span className="text-[13px] text-muted">{hint}</span> : null}
      {children}
    </div>
  )
}
