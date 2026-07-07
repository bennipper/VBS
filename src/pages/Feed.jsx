import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import MarketCard from '../components/MarketCard.jsx'
import ActivityTicker from '../components/ActivityTicker.jsx'
import { probYes } from '../lib/cpmm.js'
import { money, signedMoney } from '../lib/format.js'
import { CATEGORIES, CATEGORY_EMOJI, SORT_OPTIONS } from '../config.js'

const PL_TYPES = new Set(['bet', 'payout', 'refund', 'cashout', 'rake'])

function sortMarkets(list, sort) {
  const arr = [...list]
  switch (sort) {
    case 'oldest':
      return arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    case 'volume':
      return arr.sort((a, b) => Number(b.volume) - Number(a.volume))
    case 'odds_high':
      return arr.sort((a, b) => probYes(b.pool_yes, b.pool_no) - probYes(a.pool_yes, a.pool_no))
    case 'odds_low':
      return arr.sort((a, b) => probYes(a.pool_yes, a.pool_no) - probYes(b.pool_yes, b.pool_no))
    case 'newest':
    default:
      return arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }
}

export default function Feed() {
  const { user, profile } = useAuth()
  const [markets, setMarkets] = useState([])
  const [pl, setPl] = useState(0)
  const [tab, setTab] = useState('open') // 'open' | 'resolved'
  const [category, setCategory] = useState('All')
  const [sort, setSort] = useState('newest')
  const [sortOpen, setSortOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const sortRef = useRef(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('market_summary')
      .select('*')
      .order('created_at', { ascending: false })
    setMarkets(data ?? [])
    setLoading(false)
  }, [])

  const loadPL = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('transactions').select('type, amount').eq('user_id', user.id)
    setPl((data ?? []).reduce((a, t) => (PL_TYPES.has(t.type) ? a + Number(t.amount) : a), 0))
  }, [user])

  useEffect(() => {
    load()
    loadPL()
  }, [load, loadPL])

  useEffect(() => {
    const channel = supabase
      .channel('feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'markets' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bets' }, () => { load(); loadPL() })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load, loadPL])

  useEffect(() => {
    if (!sortOpen) return
    const close = (e) => { if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [sortOpen])

  const open = markets.filter((m) => !m.resolved_at)
  const resolved = markets.filter((m) => m.resolved_at)

  const shown = useMemo(() => {
    let list = tab === 'open' ? open : resolved
    if (category !== 'All') list = list.filter((m) => m.category === category)
    return sortMarkets(list, sort)
  }, [markets, tab, category, sort])

  const sortLabel = SORT_OPTIONS.find((s) => s.key === sort)?.label ?? 'Sort'
  const plState = pl > 0 ? 'up' : pl < 0 ? 'down' : 'flat'

  return (
    <>
      {/* Balance hero */}
      <div className="balance-hero">
        <div className="lbl">Available balance</div>
        <div className="amt-row">
          <div className="amt">{money(profile?.balance ?? 0)}</div>
          <span className={`pl-pill ${plState}`} title="All-time P/L">
            {pl > 0 ? '↑' : pl < 0 ? '↓' : '·'} {signedMoney(pl)}
          </span>
        </div>
      </div>

      <ActivityTicker />

      {/* Category chips */}
      <div className="cat-scroll">
        {['All', ...CATEGORIES].map((c) => (
          <button
            key={c}
            className={`cat-chip${category === c ? ' sel' : ''}`}
            onClick={() => setCategory(c)}
          >
            {c === 'All' ? '🎲' : CATEGORY_EMOJI[c]} {c}
          </button>
        ))}
      </div>

      {/* Tabs + sort */}
      <div className="filter-bar" ref={sortRef}>
        <div className="tabs">
          <button className={`tab${tab === 'open' ? ' active' : ''}`} onClick={() => setTab('open')}>Open</button>
          <button className={`tab${tab === 'resolved' ? ' active' : ''}`} onClick={() => setTab('resolved')}>Settled</button>
        </div>
        <button className="sort-btn" onClick={() => setSortOpen((o) => !o)}>
          ⇅ {sortLabel}
        </button>
        {sortOpen && (
          <div className="sort-menu">
            {SORT_OPTIONS.map((s) => (
              <button
                key={s.key}
                className={`sort-opt${sort === s.key ? ' sel' : ''}`}
                onClick={() => { setSort(s.key); setSortOpen(false) }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading-full"><div className="spin" /></div>
      ) : shown.length === 0 ? (
        <div className="empty">
          <div className="big">🎲</div>
          {tab === 'open' ? (
            category === 'All' ? (
              <>
                <p>No markets open. The book is bare.</p>
                <Link to="/create" className="btn btn-primary btn-sm" style={{ display: 'inline-flex' }}>
                  Open the first market
                </Link>
              </>
            ) : (
              <p>No open {category} markets. Fancy making one?</p>
            )
          ) : (
            <p>Nothing settled here yet.</p>
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
        VBS · play money · settle your own bets · shame is the mechanic
      </p>
    </>
  )
}
