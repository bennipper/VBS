import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { money, priceLabel } from '../lib/format.js'

// A quiet one-line bookie ticker of the latest action across all markets.
// Auto-scrolls; pauses on hover/touch. Items link to their market.
function itemNode(a) {
  const em = a.actor_emoji || '🎲'
  if (a.kind === 'punt') {
    return (
      <>
        {em} <b>{a.actor_username}</b> {money(a.amount, { compact: true })} on{' '}
        <span className={a.side === 'YES' ? 'tk-yes' : 'tk-no'}>{a.side}</span> @ {priceLabel(a.price_avg)}
      </>
    )
  }
  if (a.kind === 'cashout') {
    return (
      <>
        💰 <b>{a.actor_username}</b> cashed out {money(a.amount, { compact: true })}
      </>
    )
  }
  if (a.kind === 'result') {
    const cls = a.outcome === 'YES' ? 'tk-yes' : a.outcome === 'NO' ? 'tk-no' : 'tk-void'
    return (
      <>
        🏁 <b>{a.question}</b> → <span className={cls}>{a.outcome}</span>
      </>
    )
  }
  return (
    <>
      🚨 <b>{a.actor_username}</b> claimed a bailout
    </>
  )
}

export default function ActivityTicker() {
  const [items, setItems] = useState([])
  const navigate = useNavigate()

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('activity_feed')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(14)
    setItems(data ?? [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const ch = supabase
      .channel('ticker')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bets' }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'markets' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])

  if (items.length === 0) return null

  // Duplicate the list so the marquee loops seamlessly.
  const loop = [...items, ...items]

  return (
    <div className="ticker" aria-label="Latest action">
      <div className="ticker-label">LIVE</div>
      <div className="ticker-viewport">
        <div className="ticker-track">
          {loop.map((a, i) => (
            <button
              key={`${a.id}-${i}`}
              className="ticker-item"
              onClick={() => a.market_id && navigate(`/market/${a.market_id}`)}
            >
              {itemNode(a)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
