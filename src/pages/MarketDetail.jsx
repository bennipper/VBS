import { useEffect, useState, useCallback } from 'react'
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import ProbNumber from '../components/ProbNumber.jsx'
import ProbChart from '../components/ProbChart.jsx'
import BetSlip from '../components/BetSlip.jsx'
import { probYes } from '../lib/cpmm.js'
import { money, priceLabel, relTime, timeLeft } from '../lib/format.js'

function Outcome({ outcome }) {
  const cls = outcome === 'YES' ? 'badge-yes' : outcome === 'NO' ? 'badge-no' : 'badge-void'
  return <span className={`badge ${cls}`}>Settled {outcome}</span>
}

export default function MarketDetail() {
  const { id } = useParams()
  const { user, profile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [market, setMarket] = useState(null)
  const [bets, setBets] = useState([]) // chronological asc
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState('')

  const loadMarket = useCallback(async () => {
    const { data } = await supabase.from('market_summary').select('*').eq('id', id).maybeSingle()
    setMarket(data ?? null)
  }, [id])

  const loadBets = useCallback(async () => {
    const { data } = await supabase
      .from('bets')
      .select('*, user:profiles!user_id(username, avatar_emoji)')
      .eq('market_id', id)
      .order('created_at', { ascending: true })
    setBets(data ?? [])
  }, [id])

  useEffect(() => {
    Promise.all([loadMarket(), loadBets()]).then(() => setLoading(false))
  }, [loadMarket, loadBets])

  // Realtime: pools + new bets.
  useEffect(() => {
    const channel = supabase
      .channel(`market-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'markets', filter: `id=eq.${id}` },
        () => {
          loadMarket()
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bets', filter: `market_id=eq.${id}` },
        () => {
          loadBets()
          loadMarket()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, loadMarket, loadBets])

  if (loading) return <div className="loading-full"><div className="spin" /></div>
  if (!market) {
    return (
      <div className="empty">
        <div className="big">🤷</div>
        <p>Market not found.</p>
        <Link to="/" className="link-red">Back to the book</Link>
      </div>
    )
  }

  const poolYes = Number(market.pool_yes)
  const poolNo = Number(market.pool_no)
  const prob = probYes(poolYes, poolNo)
  const isCreator = user?.id === market.creator_id
  const isResolved = Boolean(market.resolved_at)
  const closed = market.closes_at && new Date(market.closes_at) <= new Date()
  const canBet = !isResolved && !closed

  async function resolve(outcome) {
    setResolveError('')
    const label = outcome === 'VOID' ? 'VOID (refund everyone)' : outcome
    if (!window.confirm(`Settle this market as ${label}? This pays out and can't be undone.`)) return
    setResolving(true)
    const { error } = await supabase.rpc('resolve_market', {
      p_market_id: id,
      p_outcome: outcome,
    })
    setResolving(false)
    if (error) {
      setResolveError(error.message)
      return
    }
    loadMarket()
    loadBets()
  }

  const feed = [...bets].reverse() // newest first

  return (
    <>
      <div style={{ marginTop: 16 }}>
        <button className="faint" onClick={() => navigate(-1)} style={{ fontSize: 13 }}>← Back</button>
      </div>

      {/* Headline */}
      <div className="card" style={{ marginTop: 10 }}>
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <h1 style={{ fontSize: 21, lineHeight: 1.25, flex: 1 }}>{market.question}</h1>
          {isResolved && <Outcome outcome={market.resolved_outcome} />}
        </div>
        <div className="meta market-card" style={{ marginTop: 8 }}>
          <span className="faint" style={{ fontSize: 12.5 }}>
            by {market.creator_emoji} <Link to={`/u/${market.creator_id}`} className="muted">{market.creator_username}</Link>
            {' · '}opened {relTime(market.created_at)}
            {market.closes_at && !isResolved && ` · ${closed ? 'betting closed' : `closes ${timeLeft(market.closes_at)}`}`}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 16 }}>
          <ProbNumber prob={prob} size="xl" label={isResolved ? 'final YES' : 'YES chance'} />
          <div className="stack" style={{ gap: 6 }}>
            <div className="slip-row" style={{ border: 'none', padding: 0, gap: 16 }}>
              <span className="k">YES</span>
              <span className="v tnum" style={{ color: 'var(--green)' }}>{priceLabel(prob)}</span>
            </div>
            <div className="slip-row" style={{ border: 'none', padding: 0, gap: 16 }}>
              <span className="k">NO</span>
              <span className="v tnum" style={{ color: 'var(--red)' }}>{priceLabel(1 - prob)}</span>
            </div>
            <div className="slip-row" style={{ border: 'none', padding: 0, gap: 16 }}>
              <span className="k">Volume</span>
              <span className="v tnum">{money(market.volume, { compact: true })}</span>
            </div>
          </div>
        </div>

        {market.description && (
          <>
            <hr className="divider" />
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>{market.description}</p>
          </>
        )}
      </div>

      {/* Chart */}
      <div className="section-head"><h2>Odds history</h2></div>
      <div className="card">
        <ProbChart points={bets} />
      </div>

      {/* Bet slip */}
      {canBet ? (
        <BetSlip
          market={market}
          poolYes={poolYes}
          poolNo={poolNo}
          balance={Number(profile?.balance ?? 0)}
          initialSide={location.state?.side}
          onPlaced={() => {
            loadMarket()
            loadBets()
          }}
        />
      ) : (
        <>
          <div className="section-head"><h2>Bet slip</h2></div>
          <div className="note-box">
            {isResolved
              ? `This market settled ${market.resolved_outcome}. Betting is closed.`
              : 'Betting has closed on this market.'}
          </div>
        </>
      )}

      {/* Resolve panel — creator only */}
      {isCreator && !isResolved && (
        <>
          <div className="section-head"><h2>Resolve · your market</h2></div>
          <div className="card stack">
            <p className="faint" style={{ margin: 0, fontSize: 13 }}>
              You opened it, you call it. Pays out immediately and can't be undone.
            </p>
            {resolveError && <div className="error-box">{resolveError}</div>}
            <div className="chips">
              <button className="btn btn-yes" disabled={resolving} onClick={() => resolve('YES')}>YES won</button>
              <button className="btn btn-no" disabled={resolving} onClick={() => resolve('NO')}>NO won</button>
            </div>
            <button className="btn btn-ghost" disabled={resolving} onClick={() => resolve('VOID')}>
              Void &amp; refund everyone
            </button>
          </div>
        </>
      )}

      {/* Bet feed */}
      <div className="section-head"><h2>Punts</h2></div>
      <div className="card">
        {feed.length === 0 ? (
          <div className="faint center" style={{ padding: '12px 0', fontSize: 13 }}>
            No punts yet. Be the mug who moves it first.
          </div>
        ) : (
          feed.map((b) => (
            <div className="feed-row" key={b.id}>
              <span className="av">{b.user?.avatar_emoji ?? '🎲'}</span>
              <span className="txt">
                <b>{b.user?.username ?? 'someone'}</b> put {money(b.amount, { compact: true })} on{' '}
                <span className={`pill-side ${b.side === 'YES' ? 'pill-yes' : 'pill-no'}`}>{b.side}</span>{' '}
                @ <span className="tnum">{priceLabel(b.price_avg)}</span>
              </span>
              <span className="when">{relTime(b.created_at)}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}
