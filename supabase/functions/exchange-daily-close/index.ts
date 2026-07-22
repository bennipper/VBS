// ============================================================================
// exchange-daily-close — 04:00 Europe/London snapshot for every ticker.
// Writes one daily_closes row per ticker (open/close/high/low/volume) for the
// trading day that just ended, then rolls the session open forward and clears
// any circuit-breaker halt. Idempotent via the (ticker_id, date) primary key.
// Schedule with pg_cron ~03:00 UTC (≈ 04:00 London BST); the lazy session-roll
// in cast_vote covers any missed run.
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

const londonDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) // YYYY-MM-DD

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: tickers, error } = await supabase.from('tickers').select('*')
  if (error) return json({ error: error.message }, 500)

  const nowIso = new Date().toISOString()
  let closed = 0
  for (const t of tickers ?? []) {
    const start = t.session_open_at ?? t.created_at
    const { data: evs } = await supabase
      .from('ticker_events').select('price_after, magnitude, kind')
      .eq('ticker_id', t.id).gte('created_at', start).lt('created_at', nowIso)

    const prices = [Number(t.session_open), Number(t.price), ...(evs ?? []).map((e) => Number(e.price_after))]
    const volume = (evs ?? []).filter((e) => e.kind === 'vote').length

    await supabase.from('daily_closes').upsert({
      ticker_id: t.id,
      room_id: t.room_id,
      date: londonDate(start),
      open: Number(t.session_open),
      close: Number(t.price),
      high: Math.max(...prices),
      low: Math.min(...prices),
      volume,
    }, { onConflict: 'ticker_id,date' })

    await supabase.from('tickers').update({
      session_open: Number(t.price),
      session_open_at: nowIso,
      halted_until: null,
    }).eq('id', t.id)
    closed++
  }

  return json({ ok: true, closed, at: nowIso })
})
