import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { signedMoney } from '../lib/format.js'

export default function Leaderboard() {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: profiles }, { data: bets }] = await Promise.all([
        supabase.from('profiles').select('id, username, avatar_emoji, bailout_count'),
        supabase.from('bets').select('user_id, amount, payout'),
      ])

      // Net P/L per user = total payouts/refunds − total staked. Ranks on skill,
      // not balance (which is inflated by bailouts).
      const pl = new Map()
      for (const b of bets ?? []) {
        const cur = pl.get(b.user_id) ?? 0
        pl.set(b.user_id, cur + (Number(b.payout) || 0) - Number(b.amount))
      }

      const ranked = (profiles ?? [])
        .map((p) => ({ ...p, pl: pl.get(p.id) ?? 0 }))
        .sort((a, b) => b.pl - a.pl)

      setRows(ranked)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <>
      <div className="section-head">
        <h2>The table</h2>
        <span className="faint" style={{ fontSize: 12 }}>ranked by P/L · shame on the right</span>
      </div>

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
            <span className="prob-label" style={{ marginTop: 0 }}>P/L</span>
            <span className="lb-bailouts prob-label" style={{ marginTop: 0, width: 44 }}>🚨</span>
          </div>
          {rows.map((r, i) => (
            <div className="lb-row" key={r.id}>
              <span className={`lb-rank${i < 3 ? ' top' : ''}`}>{i + 1}</span>
              <span className="lb-av">{r.avatar_emoji}</span>
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
    </>
  )
}
