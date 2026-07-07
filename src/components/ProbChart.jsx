// Hand-rolled SVG probability history — no chart dependency, keeps it quiet.
// points: array of { prob_after, created_at } in chronological order.
export default function ProbChart({ points, height = 120 }) {
  const W = 600
  const H = height
  const padY = 10

  // Build the series: start at 50 (market open), then each bet's prob_after.
  const series = [0.5, ...points.map((p) => Number(p.prob_after))]
  if (series.length < 2) {
    return (
      <div className="chart-wrap">
        <div className="faint center" style={{ padding: '28px 0', fontSize: 13 }}>
          No betting yet — chart fills in as punts land.
        </div>
      </div>
    )
  }

  const n = series.length
  const x = (i) => (i / (n - 1)) * W
  const y = (p) => {
    const clamped = Math.min(0.99, Math.max(0.01, p))
    return padY + (1 - clamped) * (H - padY * 2)
  }

  const linePath = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`
  const last = series[n - 1]
  const trendUp = last >= series[0]
  const stroke = trendUp ? 'var(--green)' : 'var(--red)'

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }}>
        {/* 50% guide line */}
        <line x1="0" y1={y(0.5)} x2={W} y2={y(0.5)} stroke="var(--line)" strokeWidth="1" strokeDasharray="4 5" />
        <defs>
          <linearGradient id="probfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#probfill)" />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(n - 1)} cy={y(last)} r="3.5" fill={stroke} />
      </svg>
    </div>
  )
}
