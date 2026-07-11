import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useRoom } from '../context/RoomContext.jsx'
import { signedMoney } from '../lib/format.js'
import Avatar from '../components/Avatar.jsx'

// Betting P/L only — excludes bailouts and the signup bonus.
const PL_TYPES = new Set(['bet', 'payout', 'refund', 'cashout', 'rake', 'daily_stake', 'daily_win'])

function plByUser(txns, since, until) {
  const map = new Map()
  for (const t of txns) {
    if (!PL_TYPES.has(t.type)) continue
    const ts = new Date(t.created_at).getTime()
    if (since && ts < since) continue
    if (until && ts >= until) continue
    map.set(t.user_id, (map.get(t.user_id) ?? 0) + Number(t.amount))
  }
  return map
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function Leaderboard() {
  const { user } = useAuth()
  const { activeRoomId, activeRoom } = useRoom()
  const [members, setMembers] = useState([])
  const [txns, setTxns] = useState([])
  const [tab, setTab] = useState('alltime')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!activeRoomId) {
        setMembers([])
        setTxns([])
        setLoading(false)
        return
      }
      const [{ data: m }, { data: t }] = await Promise.all([
        supabase
          .from('room_members')
          .select('user_id, bailout_count, profile:profiles(id, username, avatar_emoji, avatar_url)')
          .eq('room_id', activeRoomId),
        supabase
          .from('transactions')
          .select('user_id, type, amount, created_at')
          .eq('room_id', activeRoomId),
      ])
      setMembers(m ?? [])
      setTxns(t ?? [])
      setLoading(false)
    }
    setLoading(true)
    load()
  }, [activeRoomId])

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()

  const champ = useMemo(() => {
    if (members.length === 0) return null
    const pl = plByUser(txns, prevStart, monthStart)
    let best = null
    for (const [uid, val] of pl) {
      if (val <= 0) continue
      if (!best || val > best.val) best = { uid, val }
    }
    if (!best) return null
    const mem = members.find((m) => m.user_id === best.uid)
    if (!mem?.profile) return null
    const d = new Date(prevStart)
    return { ...mem.profile, val: best.val, month: MONTHS[d.getMonth()] }
  }, [txns, members, prevStart, monthStart])

  const rows = useMemo(() => {
    const pl = tab === 'month' ? plByUser(txns, monthStart, null) : plByUser(txns, null, null)
    return members
      .filter((m) => m.profile)
      .map((m) => ({
        id: m.user_id,
        username: m.profile.username,
        avatar_emoji: m.profile.avatar_emoji,
        avatar_url: m.profile.avatar_url,
        bailout_count: m.bailout_count,
        pl: pl.get(m.user_id) ?? 0,
      }))
      .sort((a, b) => b.pl - a.pl)
  }, [members, txns, tab, monthStart])

  if (!activeRoomId) {
    return (
      <div className="empty" style={{ paddingTop: 60 }}>
        <div className="big">🚪</div>
        <p>Leaderboards live in rooms. Join or make one first.</p>
        <Link to="/rooms" className="btn btn-primary btn-sm" style={{ display: 'inline-flex' }}>
          Go to rooms
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="section-head">
        <h2>The table · {activeRoom?.name}</h2>
        <div className="tabs">
          <button className={`tab${tab === 'alltime' ? ' active' : ''}`} onClick={() => setTab('alltime')}>
            All-time
          </button>
          <button className={`tab${tab === 'month' ? ' active' : ''}`} onClick={() => setTab('month')}>
            {MONTHS[now.getMonth()]}
          </button>
        </div>
      </div>

      {champ && (
        <div className="champ-banner">
          <span className="champ-trophy">🏆</span>
          <span>
            <b>Punter of {champ.month}</b>
            <span className="faint"> · shame the rest</span>
          </span>
          <span className="champ-name">
            <Avatar url={champ.avatar_url} emoji={champ.avatar_emoji} size={20} /> {champ.username}
            <span className="tnum v green" style={{ marginLeft: 6 }}>{signedMoney(champ.val)}</span>
          </span>
        </div>
      )}

      {loading ? (
        <div className="loading-full"><div className="spin" /></div>
      ) : rows.length === 0 ? (
        <div className="empty"><div className="big">🏆</div><p>No punters yet.</p></div>
      ) : (
        <div className="card" style={{ padding: '4px 12px' }}>
          <div className="lb-row" style={{ padding: '8px 4px', borderBottom: '1px solid var(--line)' }}>
            <span className="lb-rank faint" style={{ fontSize: 11 }}>#</span>
            <span className="lb-av" />
            <span className="lb-name prob-label" style={{ marginTop: 0 }}>Punter</span>
            <span className="prob-label" style={{ marginTop: 0 }}>{tab === 'month' ? 'Form' : 'P/L'}</span>
            <span className="lb-bailouts prob-label" style={{ marginTop: 0, width: 44 }}>🚨</span>
          </div>
          {rows.map((r, i) => (
            <div className="lb-row" key={r.id}>
              <span className={`lb-rank${i < 3 ? ' top' : ''}`}>{i + 1}</span>
              <span className="lb-av"><Avatar url={r.avatar_url} emoji={r.avatar_emoji} size={22} /></span>
              <span className="lb-name">
                <Link to={r.id === user?.id ? '/me' : `/u/${r.id}`}>
                  {r.username}
                  {r.id === user?.id && <span className="sub"> · you</span>}
                </Link>
              </span>
              <span className={`lb-pl tnum ${r.pl > 0 ? 'v green' : r.pl < 0 ? 'v red' : ''}`}>
                {signedMoney(r.pl)}
              </span>
              <span className="lb-bailouts">{r.bailout_count > 0 ? `${r.bailout_count}×` : '—'}</span>
            </div>
          ))}
        </div>
      )}

      <div className="spacer-lg" />
      <p className="faint center" style={{ fontSize: 12 }}>
        Ranked by P/L in this room, not balance — bailouts don't buy you a spot.
      </p>
    </>
  )
}
