// ---------------------------------------------------------------------------
// Client-side CPMM math — for the LIVE BET-SLIP PREVIEW ONLY.
// The authoritative version of this same math lives in the place_bet SQL RPC.
// Never trust these numbers for money movement; they're for showing the punter
// what they're about to get before they hit confirm.
// ---------------------------------------------------------------------------

// Current YES probability from the two virtual pools.
// More NO shares in the pool => YES is more likely.
export function probYes(poolYes, poolNo) {
  const total = poolYes + poolNo
  if (total <= 0) return 0.5
  return poolNo / total
}

// Clamp probability display to 1%–99% per the brief.
export function clampProb(p) {
  return Math.min(0.99, Math.max(0.01, p))
}

// Seed both pools for a market opening at probability p with liquidity L.
//   y = L·sqrt((1−p)/p),  n = L·sqrt(p/(1−p))
// p = 0.5 gives y = n = L (a straight 50/50).
export function seedPools(prob, liquidity) {
  const p = Math.min(0.99, Math.max(0.01, prob))
  const y = liquidity * Math.sqrt((1 - p) / p)
  const n = liquidity * Math.sqrt(p / (1 - p))
  return { poolYes: y, poolNo: n }
}

import { BET_VIG } from '../config.js'

// Preview a bet. side is 'YES' or 'NO'. Returns shares, avg price, payout,
// the fee (bookie margin), and the probability the market sits at afterwards.
// The 2% margin comes off the stake before it hits the pool — same as place_bet.
export function previewBet(poolYes, poolNo, side, amount) {
  const mFull = Number(amount)
  if (!Number.isFinite(mFull) || mFull <= 0) {
    return { shares: 0, avgPrice: 0, payout: 0, fee: 0, probAfter: probYes(poolYes, poolNo) }
  }

  const fee = mFull * BET_VIG
  const m = mFull - fee // effective stake into the pool

  const k = poolYes * poolNo
  let newYes
  let newNo
  let shares

  if (side === 'YES') {
    const yPrime = poolYes + m
    const nPrime = poolNo + m
    // (y' − s)·n' = k  =>  s = y' − k/n'
    shares = yPrime - k / nPrime
    newYes = yPrime - shares
    newNo = nPrime
  } else {
    const yPrime = poolYes + m
    const nPrime = poolNo + m
    shares = nPrime - k / yPrime
    newNo = nPrime - shares
    newYes = yPrime
  }

  const avgPrice = shares > 0 ? mFull / shares : 0 // honest cost per share (incl. margin)
  const payout = shares // each winning share pays $1
  const probAfter = probYes(newYes, newNo)

  return { shares, avgPrice, payout, fee, probAfter, newYes, newNo }
}

// Preview cashing out `shares` on a side back to the pool (CPMM sell = buy
// inverted). Mirrors the sell_position RPC. Returns proceeds + new probability.
export function sellPreview(poolYes, poolNo, side, shares) {
  const s = Number(shares)
  if (!Number.isFinite(s) || s <= 0) {
    return { proceeds: 0, probAfter: probYes(poolYes, poolNo) }
  }
  const k = poolYes * poolNo
  let mOut
  let newYes
  let newNo
  if (side === 'YES') {
    const a = poolYes + s
    const disc = (a + poolNo) * (a + poolNo) - 4 * (a * poolNo - k)
    mOut = ((a + poolNo) - Math.sqrt(Math.max(0, disc))) / 2
    newYes = poolYes + s - mOut
    newNo = poolNo - mOut
  } else {
    const a = poolNo + s
    const disc = (a + poolYes) * (a + poolYes) - 4 * (a * poolYes - k)
    mOut = ((a + poolYes) - Math.sqrt(Math.max(0, disc))) / 2
    newNo = poolNo + s - mOut
    newYes = poolYes - mOut
  }
  return { proceeds: Math.max(0, mOut), probAfter: probYes(newYes, newNo) }
}
