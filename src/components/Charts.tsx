import { useState } from 'react'
import { usd } from '../lib/util'

export const PALETTE = ['#3cff9e', '#14c9ff', '#9d7bff', '#ff5cc8', '#ffb547', '#ff6b5c', '#62f2ff', '#c2ff4d', '#7d8cff', '#5d6b82']
export function Donut({ items, total }: { items: { label: string; value: number }[]; total: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const R = 70, C = 2 * Math.PI * R
  let off = 0
  const h = hover != null ? items[hover] : null
  return (
    <div className="donut">
      <svg viewBox="0 0 180 180" role="img" aria-label="Allocation chart">
        <circle cx="90" cy="90" r={R} fill="none" stroke="#141a24" strokeWidth="22" />
        {items.map((it, i) => {
          const len = (it.value / total) * C, el = (
            <circle key={i} cx="90" cy="90" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={hover === i ? 28 : 22}
              strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 90 90)" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ transition: 'stroke-width .2s' }} />)
          off += len; return el
        })}
      </svg>
      <div className="donut-mid"><small>{h ? h.label : 'Tokens'}</small><b>{h ? `${((h.value / total) * 100).toFixed(1)}%` : items.length}</b></div>
    </div>
  )
}

export function Area({ data, height = 180 }: { data: { t: number; v: number }[]; height?: number }) {
  const [i, setI] = useState<number | null>(null)
  if (data.length < 2) return null
  const W = 600, H = height, min = Math.min(...data.map((d) => d.v)), max = Math.max(...data.map((d) => d.v)), span = max - min || 1
  const x = (k: number) => (k / (data.length - 1)) * W, y = (v: number) => H - 8 - ((v - min) / span) * (H - 24)
  const line = data.map((d, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(d.v).toFixed(1)}`).join('')
  const up = data[data.length - 1].v >= data[0].v, col = up ? '#3cff9e' : '#ff4d6a'
  const p = i != null ? data[i] : data[data.length - 1]
  return (
    <div className="area">
      <div className="area-read"><b>{usd(p.v)}</b><small>{new Date(p.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</small></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseLeave={() => setI(null)}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setI(Math.round(((e.clientX - r.left) / r.width) * (data.length - 1))) }}>
        <defs><linearGradient id="ag" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".35" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
        <path d={`${line}L${W},${H}L0,${H}Z`} fill="url(#ag)" />
        <path d={line} fill="none" stroke={col} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {i != null && <line x1={x(i)} x2={x(i)} y1="0" y2={H} stroke="#ffffff33" vectorEffect="non-scaling-stroke" />}
      </svg>
    </div>
  )
}
