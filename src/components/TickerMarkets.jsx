import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { seedPools } from '../lib/cpmm.js'
import { probYes } from '../lib/cpmm.js'
import { priceLabel } from '../lib/format.js'
import { SEED_LIQUIDITY } from '../config.js'

// "Now there's a reason to care about someone else's stock." A ticker_threshold
// prediction market: bet on whether the ticker closes above/below a price by a
// date. Auto-resolves off daily_closes (resolve-ticker-markets edge function).
export default function TickerMarkets({ ticker }) {
  const { user } = useAuth()
  const [markets, setMarkets] = useState([])
  const [open, setOpen] = useState(false)
  const [op, setOp] = useState('above')
  const [target, setTarget] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('market_summary').select('*')
      .eq('ticker_id', ticker.id).order('created_at', { ascending: false })
    setMarkets(data ?? [])
  }, [ticker.id])

  useEffect(() => { load() }, [load])

  async function create(e) {
    e.preventDefault()
    setErr('')
    const t = Number(target)
    if (!t || t < 1) { setErr('Enter a target price.'); return }
    if (!date) { setErr('Pick a resolve date.'); return }
    const resolveAt = new Date(`${date}T23:59:00`)
    const q = `Will ${ticker.symbol} close ${op} ${t.toFixed(2)} by ${resolveAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}?`
    const { poolYes, poolNo } = seedPools(0.5, SEED_LIQUIDITY)
    setBusy(true)
    const { error } = await supabase.from('markets').insert({
      creator_id: user.id,
      room_id: ticker.room_id,
      question: q,
      category: 'Social',
      market_type: 'ticker_threshold',
      ticker_id: ticker.id,
      threshold_operator: op,
      target_price: t,
      resolve_at: resolveAt.toISOString(),
      closes_at: resolveAt.toISOString(),
      pool_yes: poolYes,
      pool_no: poolNo,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setOpen(false); setTarget(''); setDate('')
    load()
  }

  return (
    <>
      <div className="section-head">
        <h2>Markets on {ticker.symbol}</h2>
        <button className="faint" style={{ fontSize: 13 }} onClick={() => setOpen((o) => !o)}>
          {open ? 'Cancel' : '+ New'}
        </button>
      </div>

      {open && (
        <form className="card stack" onSubmit={create}>
          {err && <div className="error-box">{err}</div>}
          <div className="chips">
            <button type="button" className={`btn btn-sm ${op === 'above' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setOp('above')}>Close above</button>
            <button type="button" className={`btn btn-sm ${op === 'below' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setOp('below')}>Close below</button>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="field" style={{ margin: 0, flex: 1 }}>
              <label>Target price</label>
              <input className="input tnum" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="130" />
            </div>
            <div className="field" style={{ margin: 0, flex: 1 }}>
              <label>By date</label>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="hint">Auto-settles from the closing price — no one has to call it.</div>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spin" /> : 'Open market'}</button>
        </form>
      )}

      {markets.length > 0 && (
        <div className="stack">
          {markets.map((m) => {
            const prob = probYes(Number(m.pool_yes), Number(m.pool_no))
            return (
              <Link to={`/market/${m.id}`} key={m.id} className="card market-card" style={{ display: 'block' }}>
                <div className="q" style={{ fontSize: 15 }}>{m.question}</div>
                <div className="meta">
                  {m.resolved_at
                    ? <span className={`badge ${m.resolved_outcome === 'YES' ? 'badge-yes' : m.resolved_outcome === 'NO' ? 'badge-no' : 'badge-void'}`}>Settled {m.resolved_outcome}</span>
                    : <span className="tnum">{priceLabel(prob)} YES</span>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
