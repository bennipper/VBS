// ============================================================================
// seed-odds — sets realistic STARTING prices for event markets from The Odds
// API (the-odds-api.com). Pre-match only, and only for markets nobody has bet
// on yet (via admin_seed_market_odds). After that, prices move as mates punt.
//
// Also refreshes each event_market_template's seed pools so rooms seeded later
// start at the right price.
//
// Secrets (set by the project owner):
//   ODDS_API_KEY  — the-odds-api.com key (required)
//   CRON_SECRET   — optional; if set, callers must send x-cron-secret
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the runtime.
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ODDS_BASE = 'https://api.the-odds-api.com/v4'
const LIQUIDITY = 600 // total seed liquidity; pool_no = p*L, pool_yes = (1-p)*L

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

const norm = (s: string) => (s ?? '').trim().toLowerCase()
function nameMatches(a: string, b: string) {
  const x = norm(a), y = norm(b)
  return x === y || x.includes(y) || y.includes(x)
}

// Turn a set of mutually-exclusive {name, price} outcomes into vig-free probs.
function impliedProbs(outcomes: any[]): Record<string, number> {
  const inv = outcomes.map((o) => ({ name: o.name, p: o.price > 0 ? 1 / o.price : 0 }))
  const sum = inv.reduce((a, o) => a + o.p, 0) || 1
  const out: Record<string, number> = {}
  for (const o of inv) out[norm(o.name)] = o.p / sum
  return out
}

function firstMarket(game: any, key: string, filter?: (m: any) => boolean) {
  for (const bk of game.bookmakers ?? []) {
    for (const m of bk.markets ?? []) {
      if (m.key === key && (!filter || filter(m))) return m
    }
  }
  return null
}

function buildCtx(game: any) {
  const ctx: any = { nameProb: {}, drawProb: null, overProb: null, bttsYes: null }

  const h2h = firstMarket(game, 'h2h')
  if (h2h) {
    const probs = impliedProbs(h2h.outcomes ?? [])
    ctx.nameProb = probs
    ctx.drawProb = probs['draw'] ?? null
  }

  // Totals around the 2.5 line.
  const totals = firstMarket(game, 'totals', (m) =>
    (m.outcomes ?? []).some((o: any) => Number(o.point) === 2.5))
  if (totals) {
    const at = (totals.outcomes ?? []).filter((o: any) => Number(o.point) === 2.5)
    const probs = impliedProbs(at.map((o: any) => ({ name: o.name, price: o.price })))
    ctx.overProb = probs['over'] ?? null
  }

  const btts = firstMarket(game, 'btts')
  if (btts) {
    const probs = impliedProbs(btts.outcomes ?? [])
    ctx.bttsYes = probs['yes'] ?? null
  }
  return ctx
}

// Map a market's resolution_rule to a YES probability, or null if we can't.
function probForRule(rule: any, ctx: any): number | null {
  if (!rule) return null
  switch (rule.type) {
    case 'match_result':
      if (rule.result === 'draw') return ctx.drawProb
      return ctx.nameProb[norm(rule.team)] ?? null
    case 'progress': {
      const win = ctx.nameProb[norm(rule.team)]
      if (win == null || ctx.drawProb == null) return null
      // Level after 90' → extra time/pens, treated as a coin flip.
      return Math.min(0.97, win + 0.5 * ctx.drawProb)
    }
    case 'btts':
      return ctx.bttsYes
    case 'total_goals':
      return Number(rule.line) === 2.5 && rule.side !== 'under' ? ctx.overProb : null
    default:
      return null // first_half_goal etc. — no market, leave the manual seed
  }
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'unauthorized' }, 401)
  }
  const apiKey = Deno.env.get('ODDS_API_KEY')
  if (!apiKey) return json({ error: 'ODDS_API_KEY not configured' }, 500)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: events, error } = await supabase
    .from('events').select('*').neq('status', 'settled')
  if (error) return json({ error: error.message }, 500)

  const results: any[] = []
  for (const ev of events ?? []) {
    try {
      if (new Date(ev.kickoff_at) <= new Date()) {
        results.push({ event: ev.slug, skipped: 'already kicked off' }); continue
      }
      if (!ev.odds_sport_key) {
        results.push({ event: ev.slug, skipped: 'no odds_sport_key' }); continue
      }

      // Sport-level odds endpoint only supports h2h/totals (not btts).
      const url = `${ODDS_BASE}/sports/${ev.odds_sport_key}/odds/?regions=uk&markets=h2h,totals&oddsFormat=decimal&apiKey=${apiKey}`
      const res = await fetch(url)
      if (!res.ok) { results.push({ event: ev.slug, error: `odds api ${res.status}` }); continue }
      const games = await res.json()

      const game = (games ?? []).find((g: any) =>
        (nameMatches(g.home_team, ev.home_team) && nameMatches(g.away_team, ev.away_team)) ||
        (nameMatches(g.home_team, ev.away_team) && nameMatches(g.away_team, ev.home_team)))
      if (!game) { results.push({ event: ev.slug, note: 'fixture not in odds feed yet' }); continue }

      const ctx = buildCtx(game)

      // Both-teams-to-score lives on the per-event odds endpoint.
      try {
        const bres = await fetch(
          `${ODDS_BASE}/sports/${ev.odds_sport_key}/events/${game.id}/odds/?regions=uk&markets=btts&oddsFormat=decimal&apiKey=${apiKey}`)
        if (bres.ok) {
          const btts = firstMarket(await bres.json(), 'btts')
          if (btts) ctx.bttsYes = impliedProbs(btts.outcomes ?? [])['yes'] ?? null
        }
      } catch { /* leave btts at its manual seed */ }

      const { data: templates } = await supabase
        .from('event_market_templates').select('id, resolution_rule').eq('event_id', ev.id)

      let priced = 0, reseeded = 0
      for (const t of templates ?? []) {
        const p = probForRule(t.resolution_rule, ctx)
        if (p == null) continue
        const clamped = Math.min(0.95, Math.max(0.05, p))
        priced++
        // Refresh the template so future room seeds start correctly.
        await supabase.from('event_market_templates').update({
          seed_no: clamped * LIQUIDITY, seed_yes: (1 - clamped) * LIQUIDITY,
        }).eq('id', t.id)
        // Reseed existing markets from this template that have no bets yet.
        const { data: mkts } = await supabase
          .from('markets').select('id').eq('template_id', t.id)
        for (const m of mkts ?? []) {
          const { data: ok } = await supabase.rpc('admin_seed_market_odds', {
            p_market_id: m.id, p_prob: clamped, p_liquidity: LIQUIDITY,
          })
          if (ok) reseeded++
        }
      }
      results.push({ event: ev.slug, game: `${game.home_team} v ${game.away_team}`, priced, reseeded })
    } catch (e) {
      results.push({ event: ev.slug, error: String(e) })
    }
  }

  return json({ ok: true, checked_at: new Date().toISOString(), results })
})
