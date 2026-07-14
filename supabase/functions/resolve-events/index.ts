// ============================================================================
// resolve-events — auto-settles TightPunt "event" markets from API-Football.
//
// For each non-settled event whose kickoff has passed:
//   1. Finds the fixture (by stored provider_fixture_id, else by date+teams).
//   2. If the match is finished (FT/AET/PEN), evaluates every unresolved
//      market's `resolution_rule` against the score and settles it via the
//      service-role-only `admin_settle_market` RPC.
//   3. Marks the event `settled` once no markets remain open.
//
// Secrets (set by the project owner):
//   APIFOOTBALL_KEY   — direct api-sports.io key for API-Football (required)
//   CRON_SECRET       — optional; if set, callers must send x-cron-secret
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the runtime.
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const API_BASE = 'https://v3.football.api-sports.io'
const FINISHED = ['FT', 'AET', 'PEN']

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback
}

function nameMatches(target: string, name: string): boolean {
  const a = target.trim().toLowerCase()
  const b = (name ?? '').trim().toLowerCase()
  return a === b || b.includes(a) || a.includes(b)
}

type Ctx = {
  homeName: string
  awayName: string
  ftHome: number
  ftAway: number
  htHome: number
  htAway: number
  winnerHome: boolean | null
  winnerAway: boolean | null
}

function buildCtx(fx: any): Ctx {
  const ft = fx.score?.fulltime ?? {}
  const ht = fx.score?.halftime ?? {}
  return {
    homeName: fx.teams?.home?.name ?? '',
    awayName: fx.teams?.away?.name ?? '',
    // Full-time = the 90-minute score (excludes extra time), which is what the
    // result/goals markets settle on. Fall back to `goals` if score is sparse.
    ftHome: num(ft.home, num(fx.goals?.home)),
    ftAway: num(ft.away, num(fx.goals?.away)),
    htHome: num(ht.home),
    htAway: num(ht.away),
    winnerHome: fx.teams?.home?.winner ?? null,
    winnerAway: fx.teams?.away?.winner ?? null,
  }
}

// Returns 'YES' | 'NO' | 'VOID' | null (null = can't settle this one yet).
function evalRule(rule: any, c: Ctx): 'YES' | 'NO' | 'VOID' | null {
  if (!rule || typeof rule !== 'object') return null
  const yes = (b: boolean) => (b ? 'YES' : 'NO')
  const total = c.ftHome + c.ftAway

  switch (rule.type) {
    case 'match_result': {
      if (rule.result === 'draw') return yes(c.ftHome === c.ftAway)
      if (nameMatches(rule.team, c.homeName)) return yes(c.ftHome > c.ftAway)
      if (nameMatches(rule.team, c.awayName)) return yes(c.ftAway > c.ftHome)
      return 'VOID'
    }
    case 'btts':
      return yes(c.ftHome > 0 && c.ftAway > 0)
    case 'total_goals': {
      const line = num(rule.line, 2.5)
      return rule.side === 'under' ? yes(total < line) : yes(total > line)
    }
    case 'team_goals': {
      const line = num(rule.line, 1.5)
      const g = nameMatches(rule.team, c.homeName) ? c.ftHome
        : nameMatches(rule.team, c.awayName) ? c.ftAway : null
      if (g === null) return 'VOID'
      return rule.side === 'under' ? yes(g < line) : yes(g > line)
    }
    case 'progress': {
      // Uses the API winner flag, so extra time / penalties are covered.
      if (nameMatches(rule.team, c.homeName)) {
        return c.winnerHome === null ? 'VOID' : yes(c.winnerHome === true)
      }
      if (nameMatches(rule.team, c.awayName)) {
        return c.winnerAway === null ? 'VOID' : yes(c.winnerAway === true)
      }
      return 'VOID'
    }
    case 'first_half_goal':
      return yes(c.htHome + c.htAway > 0)
    default:
      return null
  }
}

async function apiGet(path: string, headers: Record<string, string>): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, { headers })
  if (!res.ok) throw new Error(`API-Football ${path} -> ${res.status}`)
  return await res.json()
}

// Find the fixture by scanning the kickoff day (±1) for the two team names.
async function findFixture(ev: any, headers: Record<string, string>): Promise<number | null> {
  const ko = new Date(ev.kickoff_at)
  const days = [-1, 0, 1].map((d) => {
    const dt = new Date(ko.getTime() + d * 86400000)
    return dt.toISOString().slice(0, 10)
  })
  for (const date of days) {
    const data = await apiGet(`/fixtures?date=${date}`, headers)
    for (const item of data.response ?? []) {
      const h = item.teams?.home?.name ?? ''
      const a = item.teams?.away?.name ?? ''
      const hit =
        (nameMatches(ev.home_team, h) && nameMatches(ev.away_team, a)) ||
        (nameMatches(ev.home_team, a) && nameMatches(ev.away_team, h))
      if (hit) return item.fixture?.id ?? null
    }
  }
  return null
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'unauthorized' }, 401)
  }
  const apiKey = Deno.env.get('APIFOOTBALL_KEY')
  if (!apiKey) return json({ error: 'APIFOOTBALL_KEY not configured' }, 500)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const apiHeaders = { 'x-apisports-key': apiKey }

  const { data: events, error: evErr } = await supabase
    .from('events').select('*').neq('status', 'settled')
  if (evErr) return json({ error: evErr.message }, 500)

  const results: any[] = []
  for (const ev of events ?? []) {
    try {
      if (new Date(ev.kickoff_at) > new Date()) {
        results.push({ event: ev.slug, skipped: 'not kicked off' })
        continue
      }

      let fixtureId: number | null = ev.provider_fixture_id
      if (!fixtureId) {
        fixtureId = await findFixture(ev, apiHeaders)
        if (fixtureId) {
          await supabase.from('events')
            .update({ provider_fixture_id: fixtureId, status: 'live' }).eq('id', ev.id)
        } else {
          results.push({ event: ev.slug, note: 'fixture not found yet' })
          continue
        }
      }

      const fxData = await apiGet(`/fixtures?id=${fixtureId}`, apiHeaders)
      const fx = fxData.response?.[0]
      if (!fx) { results.push({ event: ev.slug, note: 'no fixture data' }); continue }

      const status = fx.fixture?.status?.short
      if (!FINISHED.includes(status)) {
        await supabase.from('events').update({ status: 'live' }).eq('id', ev.id)
        results.push({ event: ev.slug, note: `in progress (${status})` })
        continue
      }

      const ctx = buildCtx(fx)
      const { data: markets } = await supabase
        .from('markets').select('id, resolution_rule')
        .eq('event_id', ev.id).is('resolved_at', null)

      let settled = 0
      for (const m of markets ?? []) {
        const outcome = evalRule(m.resolution_rule, ctx)
        if (!outcome) continue
        const { error } = await supabase.rpc('admin_settle_market', {
          p_market_id: m.id, p_outcome: outcome,
        })
        if (!error) settled++
      }

      const { count } = await supabase
        .from('markets').select('id', { count: 'exact', head: true })
        .eq('event_id', ev.id).is('resolved_at', null)
      if ((count ?? 0) === 0) {
        await supabase.from('events').update({ status: 'settled' }).eq('id', ev.id)
      }
      results.push({ event: ev.slug, status, settled, remaining: count ?? 0 })
    } catch (e) {
      results.push({ event: ev.slug, error: String(e) })
    }
  }

  return json({ ok: true, checked_at: new Date().toISOString(), results })
})
