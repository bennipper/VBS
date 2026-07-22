// Client-side price maths for The Exchange — a mirror of cast_vote in
// supabase/exchange.sql for instant vote previews. The authoritative price
// always comes from the RPC; these numbers never move anything.
import { CURRENCY } from '../config.js'

// One vote of `magnitude` units in a direction. factor = 1.01^(±m). Floors at 1.
export function previewPrice(price, direction, magnitude) {
  const m = direction === 'UP' ? magnitude : -magnitude
  return Math.max(1, Math.round(Number(price) * Math.pow(1.01, m) * 100) / 100)
}

// Price to a fixed 2dp string, e.g. 127.40. Points are unitless (not money).
export function priceStr(n) {
  return (Number(n) || 0).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// % change between two prices, e.g. +4.21 / -3.10.
export function pctChange(from, to) {
  const a = Number(from) || 0
  const b = Number(to) || 0
  if (a === 0) return 0
  return ((b - a) / a) * 100
}

export function signedPct(from, to) {
  return fmtPct(pctChange(from, to))
}

// Format an already-computed percentage number, e.g. 4.2 -> "+4.20%".
export function fmtPct(p) {
  const s = `${Math.abs(Number(p) || 0).toFixed(2)}%`
  return p > 0 ? `+${s}` : p < 0 ? `−${s}` : s
}

export function signedPrice(from, to) {
  const d = (Number(to) || 0) - (Number(from) || 0)
  const s = priceStr(Math.abs(d))
  return d > 0 ? `+${s}` : d < 0 ? `−${s}` : s
}

// Up when the period closed at or above where it opened.
export function isUp(from, to) {
  return (Number(to) || 0) >= (Number(from) || 0)
}

export { CURRENCY }
