import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useRoom } from '../context/RoomContext.jsx'
import PriceChart from '../components/PriceChart.jsx'
import VoteWidget from '../components/VoteWidget.jsx'
import ChangePill from '../components/ChangePill.jsx'
import TickerMarkets from '../components/TickerMarkets.jsx'
import Avatar from '../components/Avatar.jsx'
import { priceStr, pctChange, signedPct, fmtPct } from '../lib/exchange.js'
import { relTime } from '../lib/format.js'
import { TIME_RANGES } from '../config.js'

const RANGE_DAYS = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, YTD: null, '1Y': 365 }

export default function TickerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { rooms } = useRoom()

  const [ticker, setTicker] = useState(null)
  const [events, setEvents] = useState([]) // chronological asc
  const [closes, setCloses] = useState([]) // daily_closes asc
  const [voters, setVoters] = useState({}) // user_id -> profile
  const [remaining, setRemaining] = useState(10)
  const [range, setRange] = useState('1D')
  const [pillMode, setPillMode] = useState('pct')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [confirmDelist, setConfirmDelist] = useState(false)

  const load = useCallback(async () => {
    const { data: tk } = await supabase.from('tickers').select('*').eq('id', id).maybeSingle()
    if (!tk) { setNotFound(true); setLoading(false); return }
    setTicker(tk)
    const [{ data: ev }, { data: dc }] = await Promise.all([
      supabase.from('ticker_events').select('*, voter:profiles!user_id(username, avatar_url, avatar_emoji)')
        .eq('ticker_id', id).order('created_at', { ascending: true }),
      supabase.from('daily_closes').select('*').eq('ticker_id', id).order('date', { ascending: true }),
    ])
    setEvents(ev ?? [])
    setCloses(dc ?? [])
    const vmap = {}
    for (const e of ev ?? []) if (e.voter) vmap[e.user_id] = e.voter
    setVoters(vmap)
    if (user) {
      const { data: b } = await supabase.rpc('exchange_budget', { p_room_id: tk.room_id })
      if (typeof b === 'number') setRemaining(b)
    }
    setLoading(false)
  }, [id, user])

  useEffect(() => { setLoading(true); load() }, [load])

  useEffect(() => {
    const ch = supabase.channel(`ticker-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickers', filter: `id=eq.${id}` }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticker_events', filter: `ticker_id=eq.${id}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id, load])

  const votes = useMemo(() => events.filter((e) => e.kind === 'vote'), [events])

  // Chart series for the selected range.
  const chart = useMemo(() => {
    if (!ticker) return { points: [], open: 100 }
    if (range === '1D') {
      const open = Number(ticker.session_open)
      const since = ticker.session_open_at ? new Date(ticker.session_open_at).getTime() : 0
      const today = votes.filter((e) => new Date(e.created_at).getTime() >= since)
      return {
        open,
        points: [{ v: open }, ...today.map((e) => ({ v: Number(e.price_after), mag: e.magnitude, reason: e.reason }))],
      }
    }
    const days = RANGE_DAYS[range]
    const cutoff = days == null
      ? new Date(new Date().getFullYear(), 0, 1)
      : new Date(Date.now() - days * 86400000)
    const inRange = closes.filter((c) => new Date(c.date) >= cutoff)
    const open = inRange.length ? Number(inRange[0].open) : Number(ticker.session_open)
    return {
      open,
      points: [...inRange.map((c) => ({ v: Number(c.close) })), { v: Number(ticker.price) }],
    }
  }, [ticker, votes, closes, range])

  const stats = useMemo(() => {
    if (!ticker) return null
    const all = [100, ...votes.map((e) => Number(e.price_after)), ...closes.flatMap((c) => [Number(c.high), Number(c.low)])]
    const hi = Math.max(...all), lo = Math.min(...all)
    const yearStart = new Date(new Date().getFullYear(), 0, 1)
    const yearOpen = closes.find((c) => new Date(c.date) >= yearStart)?.open ?? 100
    return { hi, lo, ytd: pctChange(Number(yearOpen), Number(ticker.price)) }
  }, [ticker, votes, closes])

  // Simple monthly earnings: best/worst day, net, volume, top reason (this month).
  const monthly = useMemo(() => {
    if (!ticker) return null
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const mVotes = votes.filter((e) => new Date(e.created_at) >= start)
    if (mVotes.length === 0) return null
    const first = Number(mVotes[0].price_before)
    const last = Number(mVotes[mVotes.length - 1].price_after)
    let best = null, worst = null
    for (const e of mVotes) {
      const chg = pctChange(Number(e.price_before), Number(e.price_after))
      if (!best || chg > best.chg) best = { chg, e }
      if (!worst || chg < worst.chg) worst = { chg, e }
    }
    const top = [...mVotes].filter((e) => e.reason).sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0))[0]
    return { net: pctChange(first, last), volume: mVotes.length, best, worst, top }
  }, [ticker, votes])

  if (loading) return <div className="loading-full"><div className="spin" /></div>
  if (notFound || !ticker) {
    return (
      <div className="empty">
        <div className="big">🤷</div>
        <p>No such ticker — maybe it was delisted.</p>
        <Link to="/exchange" className="link-red">Back to the Exchange</Link>
      </div>
    )
  }

  const price = Number(ticker.price)
  const open = Number(ticker.session_open)
  const isMember = rooms.some((r) => r.room_id === ticker.room_id)
  const halted = ticker.halted_until && new Date(ticker.halted_until).getTime() > Date.now()
  const isSubject = ticker.type === 'member' && ticker.subject_user_id === user?.id
  const canDelist = ticker.created_by === user?.id || isSubject
  const feed = [...events].reverse()

  const nextPillMode = () => setPillMode((m) => (m === 'pct' ? 'abs' : m === 'abs' ? 'alltime' : 'pct'))
  const disabledReason = !isMember ? 'Join this room to vote.' : isSubject ? "You can't vote on your own ticker." : null

  async function vote(direction, magnitude, reason) {
    const { data, error } = await supabase.rpc('cast_vote', {
      p_ticker_id: id, p_direction: direction, p_magnitude: magnitude, p_reason: reason || null,
    })
    if (error) return error.message
    const row = Array.isArray(data) ? data[0] : data
    if (row && typeof row.remaining_budget === 'number') setRemaining(row.remaining_budget)
    load()
    return null
  }

  async function delist() {
    const { error } = await supabase.rpc('delist_ticker', { p_ticker_id: id })
    if (!error) navigate('/exchange')
  }

  return (
    <>
      <div style={{ marginTop: 16 }}>
        <button className="faint" onClick={() => navigate(-1)} style={{ fontSize: 13 }}>← Exchange</button>
      </div>

      {/* Hero */}
      <div className="ticker-hero">
        <div className="th-top">
          <div>
            <div className="th-sym">
              {ticker.symbol}
              {halted && <span className="tk-halted">TRADING HALTED</span>}
            </div>
            <div className="th-name">
              {ticker.name}
              {ticker.type === 'member' && ticker.subject_user_id && (
                <> · <Link to={`/u/${ticker.subject_user_id}`} className="muted">profile</Link></>
              )}
            </div>
          </div>
        </div>
        <div className="th-price-row" onClick={nextPillMode} role="button" title="Tap to cycle">
          <div className="th-price tnum">{priceStr(price)}</div>
          <ChangePill from={open} to={price} mode={pillMode} allTimeFrom={100} />
        </div>
      </div>

      {/* Chart */}
      <PriceChart points={chart.points} open={chart.open} />
      <div className="tabs range-tabs">
        {TIME_RANGES.map((r) => (
          <button key={r} className={`tab${range === r ? ' active' : ''}`} onClick={() => setRange(r)}>{r}</button>
        ))}
      </div>

      {/* Vote */}
      <div className="section-head"><h2>Cast a vote</h2></div>
      <div className="card">
        <VoteWidget price={price} remaining={remaining} halted={halted} disabledReason={disabledReason} onVote={vote} />
      </div>

      {/* Stats */}
      {stats && (
        <div className="statgrid" style={{ marginTop: 14 }}>
          <div className="stat"><div className="k">All-time high</div><div className="v tnum">{priceStr(stats.hi)}</div></div>
          <div className="stat"><div className="k">All-time low</div><div className="v tnum">{priceStr(stats.lo)}</div></div>
          <div className="stat"><div className="k">YTD</div><div className={`v tnum ${stats.ytd >= 0 ? 'green' : 'red'}`}>{fmtPct(stats.ytd)}</div></div>
          <div className="stat"><div className="k">All-time</div><div className={`v tnum ${price >= 100 ? 'green' : 'red'}`}>{signedPct(100, price)}</div></div>
        </div>
      )}

      {/* Monthly earnings */}
      {monthly && (
        <>
          <div className="section-head"><h2>This month</h2></div>
          <div className="card stack" style={{ gap: 8 }}>
            <div className="row-between"><span className="k">Net change</span><span className={`tnum ${monthly.net >= 0 ? 'green' : 'red'}`}>{fmtPct(monthly.net)}</span></div>
            <div className="row-between"><span className="k">Votes</span><span className="tnum">{monthly.volume}</span></div>
            {monthly.top?.reason && (
              <div><span className="k">Top reason</span><div className="faint" style={{ fontSize: 13, marginTop: 2 }}>“{monthly.top.reason}” — {voters[monthly.top.user_id]?.username ?? 'someone'}</div></div>
            )}
          </div>
        </>
      )}

      {/* Prediction markets on this ticker */}
      {isMember && <TickerMarkets ticker={ticker} />}

      {/* News = the event feed (the actual product) */}
      <div className="section-head"><h2>The news</h2></div>
      <div className="card">
        {feed.length === 0 ? (
          <div className="faint center" style={{ padding: '12px 0', fontSize: 13 }}>No votes yet — move it first.</div>
        ) : feed.map((e) => {
          if (e.kind === 'listing') return (
            <div className="feed-row news-row" key={e.id}><span className="txt faint">📈 Listed at 100.00</span><span className="when">{relTime(e.created_at)}</span></div>
          )
          if (e.kind === 'halt') return (
            <div className="feed-row news-row" key={e.id}><span className="txt" style={{ color: 'var(--price-down)' }}>⛔ Trading halted — down 15% from the open</span><span className="when">{relTime(e.created_at)}</span></div>
          )
          const up = e.direction === 'UP'
          const v = voters[e.user_id]
          return (
            <div className="feed-row news-row" key={e.id}>
              <span className="av"><Avatar url={v?.avatar_url} emoji={v?.avatar_emoji} size={22} /></span>
              <div style={{ flex: 1 }}>
                <span className="txt">
                  <span className={`news-delta tnum ${up ? 'up' : 'down'}`}>{up ? '+' : '−'}{e.magnitude}</span>{' '}
                  {e.reason ? <span>{e.reason}</span> : <span className="faint">no reason given</span>}
                  {' — '}<b>{v?.username ?? 'someone'}</b>
                </span>
                <div className="faint tnum" style={{ fontSize: 12, marginTop: 2 }}>{priceStr(e.price_before)} → {priceStr(e.price_after)}</div>
              </div>
              <span className="when">{relTime(e.created_at)}</span>
            </div>
          )
        })}
      </div>

      {/* Delist */}
      {canDelist && (
        <>
          <div className="spacer-lg" />
          {confirmDelist ? (
            <div className="card stack">
              <div className="note-box">Delist <b>{ticker.symbol}</b> and take its chart with it? Can't be undone.</div>
              <div className="chips">
                <button className="btn btn-no" onClick={delist}>Yes, delist</button>
                <button className="btn btn-ghost" onClick={() => setConfirmDelist(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-ghost btn-sm hp-delete" onClick={() => setConfirmDelist(true)}>Delist {ticker.symbol}</button>
          )}
        </>
      )}
      <div className="spacer-lg" />
    </>
  )
}
