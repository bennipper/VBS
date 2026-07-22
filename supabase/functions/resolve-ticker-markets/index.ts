// ============================================================================
// resolve-ticker-markets — auto-settles `ticker_threshold` prediction markets
// from the ticker's daily close, reusing admin_settle_market. No creator
// judgement: "Will DAVE close above 130 by 31 Aug?" settles off daily_closes.
// Schedule with pg_cron (e.g. hourly, or just after exchange-daily-close).
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

const londonDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const nowIso = new Date().toISOString()
  const { data: markets, error } = await supabase
    .from('markets')
    .select('id, ticker_id, threshold_operator, target_price, resolve_at')
    .eq('market_type', 'ticker_threshold')
    .is('resolved_at', null)
    .lte('resolve_at', nowIso)
  if (error) return json({ error: error.message }, 500)

  const results: any[] = []
  for (const m of markets ?? []) {
    if (!m.ticker_id) { results.push({ market: m.id, note: 'no ticker' }); continue }
    const date = londonDate(m.resolve_at)
    // The close on the resolve date; wait if it hasn't been snapshotted yet.
    const { data: dc } = await supabase
      .from('daily_closes').select('close')
      .eq('ticker_id', m.ticker_id).eq('date', date).maybeSingle()
    if (!dc) { results.push({ market: m.id, note: 'awaiting daily close' }); continue }

    const close = Number(dc.close)
    const hit = m.threshold_operator === 'above'
      ? close > Number(m.target_price)
      : close < Number(m.target_price)
    const outcome = hit ? 'YES' : 'NO'

    const { error: e } = await supabase.rpc('admin_settle_market', { p_market_id: m.id, p_outcome: outcome })
    results.push({ market: m.id, close, outcome, settled: !e, error: e?.message })
  }

  return json({ ok: true, checked_at: nowIso, results })
})
