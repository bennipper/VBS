import { CURRENCY } from '../config.js'

// Money, e.g. £1,000.00 (or £1,000 when whole and compact).
export function money(n, { compact = false } = {}) {
  const v = Number(n) || 0
  const sign = v < 0 ? '-' : ''
  const abs = Math.abs(v)
  if (compact && Number.isInteger(abs)) {
    return `${sign}${CURRENCY}${abs.toLocaleString('en-GB')}`
  }
  return `${sign}${CURRENCY}${abs.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// Signed money for P/L, always shows + or −.
export function signedMoney(n) {
  const v = Number(n) || 0
  const s = money(Math.abs(v))
  if (v > 0) return `+${s}`
  if (v < 0) return `−${s}`
  return s
}

// Probability 0..1 -> "34%" (clamped 1–99 for display).
export function pct(p) {
  const clamped = Math.min(0.99, Math.max(0.01, Number(p) || 0))
  return `${Math.round(clamped * 100)}%`
}

// Price in pence-style, e.g. 0.41 -> "41¢" ... but British, so "41p".
export function priceLabel(p) {
  const clamped = Math.min(0.99, Math.max(0.01, Number(p) || 0))
  return `${Math.round(clamped * 100)}p`
}

// Shares to 1dp.
export function shares(n) {
  return (Number(n) || 0).toLocaleString('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })
}

// Relative time: "2m", "3h", "in 4h", "closed".
export function relTime(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = then - now // positive = future
  const abs = Math.abs(diff)
  const mins = Math.round(abs / 60000)
  const hrs = Math.round(abs / 3600000)
  const days = Math.round(abs / 86400000)
  let label
  if (mins < 1) label = 'now'
  else if (mins < 60) label = `${mins}m`
  else if (hrs < 24) label = `${hrs}h`
  else label = `${days}d`
  return diff >= 0 ? label : `${label} ago`
}

export function timeLeft(closesAt) {
  if (!closesAt) return null
  const diff = new Date(closesAt).getTime() - Date.now()
  if (diff <= 0) return 'closed'
  return relTime(closesAt)
}
