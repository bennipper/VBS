import { signedPct, signedPrice, pctChange } from '../lib/exchange.js'

// Reuses the header P/L pill (.pl-pill) — Apple's change-pill pattern, arrow and
// all. mode: 'pct' | 'abs'. Green up, red down, only place these colours appear.
export default function ChangePill({ from, to, mode = 'pct', allTimeFrom }) {
  const base = mode === 'alltime' ? Number(allTimeFrom ?? from) : Number(from)
  const p = pctChange(base, to)
  const state = p > 0 ? 'up' : p < 0 ? 'down' : 'flat'
  const arrow = p > 0 ? '↑' : p < 0 ? '↓' : '·'
  const label =
    mode === 'abs' ? signedPrice(from, to)
    : mode === 'alltime' ? signedPct(allTimeFrom ?? from, to)
    : signedPct(from, to)
  return (
    <span className={`pl-pill ${state} change-pill tnum`}>
      {arrow} {label}
    </span>
  )
}
