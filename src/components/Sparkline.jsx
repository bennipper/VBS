// Small SVG price sparkline — up/down stroke, gradient fill, and a dashed
// baseline at the period open (the thing that makes it legible at 60px).
// Modelled on ProbChart.jsx. `points` = prices in chronological order.
let uid = 0

export default function Sparkline({ points, open, width = 72, height = 40 }) {
  const series = (points ?? []).map(Number).filter((n) => !Number.isNaN(n))
  if (series.length < 2) {
    // Flat line at the current/open level so the column still aligns.
    const v = series[0] ?? Number(open) ?? 100
    series.splice(0, series.length, v, v)
  }
  const base = Number(open ?? series[0])
  const lo = Math.min(...series, base)
  const hi = Math.max(...series, base)
  const span = hi - lo || 1
  const pad = 4
  const n = series.length
  const x = (i) => (i / (n - 1)) * width
  const y = (v) => pad + (1 - (v - lo) / span) * (height - pad * 2)

  const line = series.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L ${width} ${height} L 0 ${height} Z`
  const up = series[n - 1] >= base
  const stroke = up ? 'var(--price-up)' : 'var(--price-down)'
  const gid = `spark${uid++}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1={y(base)} x2={width} y2={y(base)} stroke={stroke} strokeOpacity="0.4" strokeWidth="1" strokeDasharray="3 3" />
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
