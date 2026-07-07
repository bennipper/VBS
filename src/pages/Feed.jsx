import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import MarketCard from '../components/MarketCard.jsx'
import ActivityTicker from '../components/ActivityTicker.jsx'
import { APP_NAME } from '../config.js'

export default function Feed() {
  const [markets, setMarkets] = useState([])
  const [tab, setTab] = useState('open') // 'open' | 'resolved'
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('market_summary')
      .select('*')
      .order('created_at', { ascending: false })
    setMarkets(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Realtime: any bet or market change re-pulls the summary so odds + volume tick.
  useEffect(() => {
    const channel = supabase
      .channel('feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'markets' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bets' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  const open = markets.filter((m) => !m.resolved_at)
  const resolved = markets.filter((m) => m.resolved_at)
  const shown = tab === 'open' ? open : resolved

  return (
    <>
      <ActivityTicker />

      <div className="section-head">
        <h2>The book</h2>
        <div className="tabs">
          <button className={`tab${tab === 'open' ? ' active' : ''}`} onClick={() => setTab('open')}>
            Open {open.length ? `· ${open.length}` : ''}
          </button>
          <button className={`tab${tab === 'resolved' ? ' active' : ''}`} onClick={() => setTab('resolved')}>
            Settled {resolved.length ? `· ${resolved.length}` : ''}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-full"><div className="spin" /></div>
      ) : shown.length === 0 ? (
        <div className="empty">
          <div className="big">🎲</div>
          {tab === 'open' ? (
            <>
              <p>No markets open. The book is bare.</p>
              <Link to="/create" className="btn btn-primary btn-sm" style={{ display: 'inline-flex' }}>
                Open the first market
              </Link>
            </>
          ) : (
            <p>Nothing settled yet.</p>
          )}
        </div>
      ) : (
        <div className="stack">
          {shown.map((m) => (
            <MarketCard key={m.id} m={m} />
          ))}
        </div>
      )}

      <div className="spacer-lg" />
      <p className="faint center" style={{ fontSize: 12 }}>
        {APP_NAME} · play money · settle your own bets · shame is the mechanic
      </p>
    </>
  )
}
