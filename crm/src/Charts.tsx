import type { ReactNode } from 'react'

export interface Row { label: string; value: number; color?: string; hint?: string }
const palette = ['#2f5bea', '#14b8a6', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#64748b', '#15803d']
const colorAt = (index: number) => palette[index % palette.length]

// Barras horizontales: legibles con etiquetas largas y accesibles como lista.
export function BarList({ rows, format = String, label }: { rows: Row[]; format?: (value: number) => string; label: string }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return <ul className="bar-list" aria-label={label}>{rows.map((r, i) => <li key={r.label}>
    <div className="bar-head"><span title={r.label}>{r.label}</span><strong>{format(r.value)}</strong></div>
    <div className="bar-track" aria-hidden="true"><span style={{ width: `${Math.max(r.value > 0 ? 2 : 0, r.value / max * 100)}%`, background: r.color ?? colorAt(i) }} /></div>
    {r.hint && <small>{r.hint}</small>}</li>)}</ul>
}

// Dona con leyenda; el total va al centro.
export function Donut({ rows, center, label }: { rows: Row[]; center: ReactNode; label: string }) {
  const total = rows.reduce((s, r) => s + r.value, 0), radius = 52, circumference = 2 * Math.PI * radius
  let offset = 0
  return <div className="donut-wrap"><div className="donut" role="img" aria-label={`${label}: ${rows.map(r => `${r.label} ${r.value}`).join(', ')}`}>
    <svg viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r={radius} fill="none" stroke="#eef1f7" strokeWidth="18" />
      {total > 0 && rows.map((r, i) => { const length = r.value / total * circumference, node = <circle key={r.label} cx="70" cy="70" r={radius} fill="none" stroke={r.color ?? colorAt(i)} strokeWidth="18"
        strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)"><title>{`${r.label}: ${r.value}`}</title></circle>; offset += length; return node })}</svg>
    <div className="donut-center">{center}</div></div>
    <ul className="legend">{rows.map((r, i) => <li key={r.label}><span className="swatch" style={{ background: r.color ?? colorAt(i) }} />{r.label}<strong>{r.value}</strong></li>)}</ul></div>
}

export interface Series { name: string; color: string; values: number[] }
// Líneas con área suave. Pocas etiquetas en el eje para que se lean en pantallas pequeñas.
export function LineChart({ labels, series, label }: { labels: string[]; series: Series[]; label: string }) {
  const w = 640, h = 220, left = 34, bottom = 26, top = 12, right = 10
  const max = Math.max(1, ...series.flatMap(s => s.values)), top5 = Math.ceil(max / 4) * 4 || 4
  const x = (i: number) => left + (labels.length <= 1 ? (w - left - right) / 2 : i / (labels.length - 1) * (w - left - right)), y = (v: number) => top + (1 - v / top5) * (h - top - bottom)
  const ticks = [0, 1, 2, 3, 4].map(n => n * top5 / 4), every = Math.max(1, Math.ceil(labels.length / 6))
  return <div className="line-wrap"><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}: ${series.map(s => `${s.name} ${s.values.reduce((a, b) => a + b, 0)} en total`).join(', ')}`}>
    {ticks.map(t => <g key={t}><line x1={left} x2={w - right} y1={y(t)} y2={y(t)} stroke="#e8ecf3" /><text x={left - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#7d8ca3">{Math.round(t)}</text></g>)}
    {labels.map((l, i) => i % every === 0 && <text key={l + i} x={x(i)} y={h - 8} textAnchor="middle" fontSize="9" fill="#7d8ca3">{l}</text>)}
    {series.map(s => { const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
      return <g key={s.name}><polygon points={`${x(0)},${y(0)} ${pts} ${x(labels.length - 1)},${y(0)}`} fill={s.color} opacity=".08" /><polyline points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
        {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="#fff" stroke={s.color} strokeWidth="1.6"><title>{`${s.name} · ${labels[i]}: ${v}`}</title></circle>)}</g> })}</svg>
    <ul className="legend inline">{series.map(s => <li key={s.name}><span className="swatch" style={{ background: s.color }} />{s.name}</li>)}</ul></div>
}
