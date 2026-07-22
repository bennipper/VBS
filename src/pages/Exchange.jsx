import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useRoom } from '../context/RoomContext.jsx'
import TickerRow from '../components/TickerRow.jsx'
import Sparkline from '../components/Sparkline.jsx'
import ChangePill from '../components/ChangePill.jsx'
import { priceStr, pctChange } from '../lib/exchange.js'
import { INDEX_LABEL } from '../config.js'

export default function Exchange() {
  const { activeRoomId, activeRoom, rooms, loading: roomsLoading } = useRoom()
  const navigate = useNavigate()
  const [tickers, setTickers] = useState([])
  const [events, setEvents] = useState([]) // today's vote events, chronological
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!activeRoomId) { setTickers([]); setEvents([]); setLoading(false); return }
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const [{ data: tk }, { data: ev }] = await Promise.all([
      supabase.from('tickers').select('*').eq('room_id', activeRoomId).order('created_at', { ascending: true }),
      supabase.from('ticker_events').select('ticker_id, price_after, created_at')
        .eq('room_id', activeRoomId).eq('kind', 'vote').gte('created_at', since)
        .order('created_at', { ascending: true }),
    ])
    setTickers(tk ?? [])
    setEvents(ev ?? [])
    setLoading(false)
  }, [activeRoomId])

  useEffect(() => { setLoading(true); load() }, [load])

  // Realtime: prices + new votes in this room.
  useEffect(() => {
    if (!activeRoomId) return
    const ch = supabase.channel(`exchange-${activeRoomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickers', filter: `room_id=eq.${activeRoomId}` }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticker_events', filter: `room_id=eq.${activeRoomId}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [activeRoomId, load])

  // Per-ticker intraday series: [session_open, ...today's prices].
  const seriesByTicker = useMemo(() => {
    const map = {}
    for (const t of tickers) map[t.id] = [Number(t.session_open)]
    for (const e of events) if (map[e.ticker_id]) map[e.ticker_id].push(Number(e.price_after))
    return map
  }, [tickers, events])

  const halted = useMemo(() => {
    const now = Date.now()
    const m = {}
    for (const t of tickers) m[t.id] = t.halted_until && new Date(t.halted_until).getTime() > now
    return m
  }, [tickers])

  // The Index: mean price, and an intraday mean series replayed from events.
  const index = useMemo(() => {
    if (tickers.length === 0) return null
    const price = tickers.reduce((a, t) => a + Number(t.price), 0) / tickers.length
    const open = tickers.reduce((a, t) => a + Number(t.session_open), 0) / tickers.length
    const cur = {}
    for (const t of tickers) cur[t.id] = Number(t.session_open)
    const series = [open]
    for (const e of events) {
      if (cur[e.ticker_id] == null) continue
      cur[e.ticker_id] = Number(e.price_after)
      series.push(Object.values(cur).reduce((a, v) => a + v, 0) / tickers.length)
    }
    return { price, open, series }
  }, [tickers, events])

  const mover = useMemo(() => {
    let best = null
    for (const t of tickers) {
      const p = Math.abs(pctChange(Number(t.session_open), Number(t.price)))
      if (p > 0.001 && (!best || p > best.p)) best = { t, p }
    }
    return best
  }, [tickers])

  if (!roomsLoading && rooms.length === 0) {
    return (
      <div className="empty" style={{ paddingTop: 80 }}>
        <div className="big">📈</div>
        <p>The Exchange lives inside a room.<br />Join or make one first.</p>
        <Link to="/me" className="btn btn-primary btn-sm" style={{ display: 'inline-flex' }}>Go to your account</Link>
      </div>
    )
  }

  return (
    <>
      <div className="exchange-head">
        <div>
          <h1 className="exchange-title">The Exchange</h1>
          <div className="exchange-sub">
            {activeRoom?.name ?? 'this room'} · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/ticker/new')}>+ List</button>
      </div>

      {/* Biggest mover */}
      {mover && (
        <div className="mover-card" onClick={() => navigate(`/ticker/${mover.t.id}`)} role="button">
          <span className="mover-label">Biggest mover today</span>
          <span className="mover-body">
            <b>{mover.t.symbol}</b>
            <span className="tk-name"> {mover.t.name}</span>
          </span>
          <ChangePill from={mover.t.session_open} to={mover.t.price} />
        </div>
      )}

      {/* Type filter chips */}
      <div className="cat-scroll">
        {TICKER_FILTERS.map((f) => (
          <button key={f.key} className={`cat-chip${filter === f.key ? ' sel' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-full"><div className="spin" /></div>
      ) : tickers.length === 0 ? (
        <div className="empty">
          <div className="big">📊</div>
          <p>Nothing listed in {activeRoom?.name ?? 'this room'} yet.</p>
          <button className="btn btn-primary btn-sm" style={{ display: 'inline-flex' }} onClick={() => navigate('/ticker/new')}>
            List the first ticker
          </button>
        </div>
      ) : (
        <div className="card tk-card">
          {/* The Index, pinned */}
          {index && (
            <div className="tk-row tk-index">
              <div className="tk-id">
                <div className="tk-sym">{INDEX_LABEL}</div>
                <div className="tk-name">{tickers.length} listed</div>
              </div>
              <div className="tk-spark"><Sparkline points={index.series} open={index.open} /></div>
              <div className="tk-right">
                <div className="tk-price tnum">{priceStr(index.price)}</div>
                <ChangePill from={index.open} to={index.price} />
              </div>
            </div>
          )}
          {shown.map((t) => (
            <TickerRow key={t.id} ticker={t} series={seriesByTicker[t.id]} halted={halted[t.id]} />
          ))}
        </div>
      )}

      <div className="spacer-lg" />
      <p className="faint center" style={{ fontSize: 12 }}>
        Vote to move the price · 10 units a day · every vote has your name on it
      </p>
    </>
  )
}
