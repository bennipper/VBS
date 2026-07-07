// Badges computed from a punter's history. Pure — no network.
// Each returns { emoji, name, desc, earned }.
export function computeAchievements({ bets, profile, marketsCreated, rakeEarned }) {
  const settled = bets.filter(
    (b) => b.market?.resolved_at && b.market?.resolved_outcome !== 'VOID'
  )
  const won = settled.filter((b) => b.side === b.market.resolved_outcome)
  const lost = settled.filter((b) => b.side !== b.market.resolved_outcome)

  // Longest run of wins, chronologically.
  const chrono = [...settled].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  )
  let streak = 0
  let best = 0
  for (const b of chrono) {
    if (b.side === b.market.resolved_outcome) {
      streak += 1
      best = Math.max(best, streak)
    } else {
      streak = 0
    }
  }

  return [
    { emoji: '🐐', name: 'Nostradamus', desc: 'Won a punt backed at 10p or better', earned: won.some((b) => Number(b.price_avg) <= 0.1) },
    { emoji: '🎯', name: 'Underdog', desc: 'Won a punt backed under 50p', earned: won.some((b) => Number(b.price_avg) < 0.5) },
    { emoji: '🔥', name: 'On Fire', desc: 'Won 3 punts in a row', earned: best >= 3 },
    { emoji: '🐋', name: 'Whale', desc: 'Staked £500+ on a single punt', earned: bets.some((b) => Number(b.amount) >= 500) },
    { emoji: '🏗️', name: 'Market Maker', desc: 'Opened 3 or more markets', earned: (marketsCreated || 0) >= 3 },
    { emoji: '🧾', name: 'The Bookie', desc: 'Earned rake from your own markets', earned: (rakeEarned || 0) > 0 },
    { emoji: '🤡', name: 'Mug', desc: 'Lost a punt backed at 80p+', earned: lost.some((b) => Number(b.price_avg) >= 0.8) },
    { emoji: '💸', name: 'Skint', desc: 'Claimed a bailout', earned: (profile?.bailout_count || 0) > 0 },
  ]
}
