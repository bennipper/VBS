import { useRef, useState } from 'react'
import { priceStr } from '../lib/exchange.js'

// Full-width, axis-less price chart. Dashed baseline at the period open, a
// gradient fill, dots on high-magnitude (≥4) events, and scrub-to-inspect.
// points: [{ v: price, mag?, reason?, at? }] chronological. open = baseline.
export default function PriceChart({ points, open, height = 220 }) {
  const W = 700
  const H = height
  const pad = 16
  const svgRef = useRef(null)
  const [scrub, setScrub] = useState(null) // index under the finger

  const series = (points ?? []).map((p) => ({ ...p, v: Number(p.v) }))
  if (series.length < 2) {
    return <div className="chart-wrap"><div className="faint center" style={{ padding: '40px 0', fontSize: 13 }}>No moves in this range yet.</div></div>
  }

  const base = Number(open ?? series[0].v)
  const vals = series.map((p) => p.v).concat(base)
  const lo = Math.min(...vals), hi = Math.max(...vals)
  const span = hi - lo || 1
  const n = series.length
  const x = (i) => pad + (i / (n - 1)) * (W - pad * 2)
  const y = (v) => pad + (1 - (v - lo) / span) * (H - pad * 2)

  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')
  const area = `${line} L ${x(n - 1)} ${H - pad} L ${x(0)} ${H - pad} Z`
  const up = series[n - 1].v >= base
  const stroke = up ? 'var(--price-up)' : 'var(--price-down)'

  function onMove(e) {
    const rect = svgRef.current.getBoundingClientRect()
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
    const rel = Math.max(0, Math.min(1, cx / rect.width))
    setScrub(Math.round(rel * (n - 1)))
  }

  const sp = scrub != null ? series[scrub] : null

  return (
    <div className="chart-wrap">
      {sp && (
        <div className="scrub-readout tnum">
          <b>{priceStr(sp.v)}</b>
          {sp.reason && <span className="faint"> · {sp.reason}</span>}
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height }}
        onMouseMove={onMove}
        onMouseLeave={() => setScrub(null)}
        onTouchStart={onMove}
        onTouchMove={onMove}
        onTouchEnd={() => setScrub(null)}
      >
        <defs>
          <linearGradient id="pricefill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={pad} y1={y(base)} x2={W - pad} y2={y(base)} stroke={stroke} strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="5 5" />
        <path d={area} fill="url(#pricefill)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {series.map((p, i) => (p.mag >= 4 ? (
          <circle key={i} cx={x(i)} cy={y(p.v)} r="4" fill={stroke} stroke="var(--card)" strokeWidth="1.5" />
        ) : null))}
        {sp && (
          <>
            <line x1={x(scrub)} y1={pad} x2={x(scrub)} y2={H - pad} stroke="var(--paper-faint)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={x(scrub)} cy={y(sp.v)} r="4.5" fill={stroke} stroke="var(--card)" strokeWidth="2" />
          </>
        )}
      </svg>
    </div>
  )
}
