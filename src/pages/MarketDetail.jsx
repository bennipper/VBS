import { useEffect, useState, useCallback } from 'react'
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import ProbNumber from '../components/ProbNumber.jsx'
import ProbChart from '../components/ProbChart.jsx'
import BetSlip from '../components/BetSlip.jsx'
import ReactionBar from '../components/ReactionBar.jsx'
import Avatar from '../components/Avatar.jsx'
import { probYes, sellPreview } from '../lib/cpmm.js'
import { money, priceLabel, relTime, timeLeft, shares as fmtShares } from '../lib/format.js'

function Outcome({ outcome }) {
  const cls = outcome === 'YES' ? 'badge-yes' : outcome === 'NO' ? 'badge-no' : 'badge-void'
  return <span className={`badge ${cls}`}>Settled {outcome}</span>
}

export default function MarketDetail() {
  const { id } = useParams()
  const { user, profile, refreshProfile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [market, setMarket] = useState(null)
  const [bets, setBets] = useState([]) // chronological asc
  const [reactions, setReactions] = useState([]) // [{ bet_id, user_id, emoji }]
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState('')
  const [confirmOutcome, setConfirmOutcome] = useState(null) // pending resolve outcome
  const [cashingOut, setCashingOut] = useState(false)
  const [cashoutError, setCashoutError] = useState('')
  const [confirmCashout, setConfirmCashout] = useState(null) // pending cash-out side

  const loadMarket = useCallback(async () => {
    const { data } = await supabase.from('market_summary').select('*').eq('id', id).maybeSingle()
    setMarket(data ?? null)
  }, [id])

  const loadBets = useCallback(async () => {
    const { data } = await supabase
      .from('bets')
      .select('*, user:profiles!user_id(username, avatar_emoji, avatar_url)')
      .eq('market_id', id)
      .order('created_at', { ascending: true })
    setBets(data ?? [])
  }, [id])

  const loadReactions = useCallback(async () => {
    const { data } = await supabase
      .from('bet_reactions')
      .select('bet_id, user_id, emoji, bets!inner(market_id)')
      .eq('bets.market_id', id)
    setReactions((data ?? []).map((r) => ({ bet_id: r.bet_id, user_id: r.user_id, emoji: r.emoji })))
  }, [id])

  // Optimistic local toggle so a tap feels instant; realtime reconciles.
  const toggleReactionLocal = useCallback(
    (betId, emoji, added) => {
      setReactions((prev) => {
        if (added) return [...prev, { bet_id: betId, user_id: user.id, emoji }]
        return prev.filter(
          (r) => !(r.bet_id === betId && r.user_id === user.id && r.emoji === emoji)
        )
      })
    },
    [user?.id]
  )

  useEffect(() => {
    Promise.all([loadMarket(), loadBets(), loadReactions()]).then(() => setLoading(false))
  }, [loadMarket, loadBets, loadReactions])

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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bet_reactions' },
        () => {
          loadReactions()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, loadMarket, loadBets, loadReactions])

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
    setConfirmOutcome(null)
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

  async function cashOut(side) {
    setCashoutError('')
    setConfirmCashout(null)
    setCashingOut(true)
    const { error } = await supabase.rpc('sell_position', {
      p_market_id: id,
      p_side: side,
      p_shares: null, // sell the whole position
    })
    setCashingOut(false)
    if (error) {
      setCashoutError(error.message)
      return
    }
    refreshProfile()
    loadMarket()
    loadBets()
  }

  // Your open position on this market (unsold shares per side).
  const myBets = user ? bets.filter((b) => b.user_id === user.id) : []
  const posYes = myBets.filter((b) => b.side === 'YES').reduce((a, b) => a + Number(b.shares_open || 0), 0)
  const posNo = myBets.filter((b) => b.side === 'NO').reduce((a, b) => a + Number(b.shares_open || 0), 0)
  const hasPosition = !isResolved && (posYes > 0.0001 || posNo > 0.0001)

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
            by <Avatar url={market.creator_avatar_url} emoji={market.creator_emoji} size={14} />{' '}
            <Link to={`/u/${market.creator_id}`} className="muted">{market.creator_username}</Link>
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

      {/* Your position + cash out */}
      {hasPosition && (
        <>
          <div className="section-head"><h2>Your position</h2></div>
          <div className="card stack">
            {cashoutError && <div className="error-box">{cashoutError}</div>}
            {posYes > 0.0001 && (
              <div className="row-between">
                <div>
                  <div><span className="pill-side pill-yes">YES</span> <span className="tnum">{fmtShares(posYes)}</span> shares</div>
                  <div className="faint tnum" style={{ fontSize: 12.5, marginTop: 2 }}>
                    cash out ≈ {money(sellPreview(poolYes, poolNo, 'YES', posYes).proceeds)}
                  </div>
                </div>
                {confirmCashout === 'YES' ? (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-primary btn-sm" disabled={cashingOut} onClick={() => cashOut('YES')}>
                      {cashingOut ? <span className="spin" /> : `Confirm ${money(sellPreview(poolYes, poolNo, 'YES', posYes).proceeds, { compact: true })}`}
                    </button>
                    <button className="btn btn-ghost btn-sm" disabled={cashingOut} onClick={() => setConfirmCashout(null)}>✕</button>
                  </div>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmCashout('YES')}>Cash out</button>
                )}
              </div>
            )}
            {posNo > 0.0001 && (
              <div className="row-between">
                <div>
                  <div><span className="pill-side pill-no">NO</span> <span className="tnum">{fmtShares(posNo)}</span> shares</div>
                  <div className="faint tnum" style={{ fontSize: 12.5, marginTop: 2 }}>
                    cash out ≈ {money(sellPreview(poolYes, poolNo, 'NO', posNo).proceeds)}
                  </div>
                </div>
                {confirmCashout === 'NO' ? (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-primary btn-sm" disabled={cashingOut} onClick={() => cashOut('NO')}>
                      {cashingOut ? <span className="spin" /> : `Confirm ${money(sellPreview(poolYes, poolNo, 'NO', posNo).proceeds, { compact: true })}`}
                    </button>
                    <button className="btn btn-ghost btn-sm" disabled={cashingOut} onClick={() => setConfirmCashout(null)}>✕</button>
                  </div>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmCashout('NO')}>Cash out</button>
                )}
              </div>
            )}
          </div>
        </>
      )}

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
            {confirmOutcome ? (
              <>
                <div className="note-box">
                  Settle as <b>{confirmOutcome === 'VOID' ? 'VOID (refund everyone)' : `${confirmOutcome} won`}</b>?
                  This pays out immediately and can’t be undone.
                </div>
                <div className="chips">
                  <button
                    className={`btn ${confirmOutcome === 'YES' ? 'btn-yes' : confirmOutcome === 'NO' ? 'btn-no' : 'btn-primary'}`}
                    disabled={resolving}
                    onClick={() => resolve(confirmOutcome)}
                  >
                    {resolving ? <span className="spin" /> : `Yes, settle ${confirmOutcome}`}
                  </button>
                  <button className="btn btn-ghost" disabled={resolving} onClick={() => setConfirmOutcome(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="chips">
                  <button className="btn btn-yes" onClick={() => setConfirmOutcome('YES')}>YES won</button>
                  <button className="btn btn-no" onClick={() => setConfirmOutcome('NO')}>NO won</button>
                </div>
                <button className="btn btn-ghost" onClick={() => setConfirmOutcome('VOID')}>
                  Void &amp; refund everyone
                </button>
              </>
            )}
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
            <div className="feed-row feed-row-react" key={b.id}>
              <span className="av"><Avatar url={b.user?.avatar_url} emoji={b.user?.avatar_emoji} size={22} /></span>
              <div style={{ flex: 1 }}>
                <span className="txt">
                  <b>{b.user?.username ?? 'someone'}</b> put {money(b.amount, { compact: true })} on{' '}
                  <span className={`pill-side ${b.side === 'YES' ? 'pill-yes' : 'pill-no'}`}>{b.side}</span>{' '}
                  @ <span className="tnum">{priceLabel(b.price_avg)}</span>
                </span>
                <ReactionBar
                  betId={b.id}
                  reactions={reactions.filter((r) => r.bet_id === b.id)}
                  userId={user?.id}
                  onChange={(emoji, added) => toggleReactionLocal(b.id, emoji, added)}
                />
              </div>
              <span className="when">{relTime(b.created_at)}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}
