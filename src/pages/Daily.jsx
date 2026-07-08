import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { money } from '../lib/format.js'
import Avatar from '../components/Avatar.jsx'

// Countdown to the day's close, e.g. "7h 12m".
function useCountdown(iso) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (!iso) return
    const tick = () => {
      const ms = new Date(iso).getTime() - Date.now()
      if (ms <= 0) return setLabel('closed')
      const h = Math.floor(ms / 3600000)
      const m = Math.floor((ms % 3600000) / 60000)
      setLabel(h > 0 ? `${h}h ${m}m` : `${m}m`)
    }
    tick()
    const t = setInterval(tick, 30000)
    return () => clearInterval(t)
  }, [iso])
  return label
}

export default function Daily() {
  const { refreshProfile } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data: d, error } = await supabase.rpc('get_daily')
    if (error) setErr(error.message)
    else setData(d)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const today = data?.today
  const yesterday = data?.yesterday
  const streak = data?.streak ?? 0
  const countdown = useCountdown(today?.closes_at)
  const picked = Boolean(today?.my_side)

  async function pick(side) {
    if (busy || picked) return
    setErr('')
    setBusy(true)
    const { error } = await supabase.rpc('pick_daily', {
      p_question_id: today.id,
      p_side: side,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    refreshProfile()
    load()
  }

  if (loading) return <div className="loading-full"><div className="spin" /></div>

  return (
    <>
      <div className="section-head">
        <h2>The Daily</h2>
        {streak > 0 && <span className="streak-pill tnum">🔥 {streak} streak</span>}
      </div>

      {err && <div className="error-box">{err}</div>}

      {today && (
        <div className="card stack">
          <div className="row-between">
            <span className="prob-label">Today's question</span>
            <span className="faint tnum" style={{ fontSize: 12 }}>closes in {countdown}</span>
          </div>

          <div className="daily-q">{today.question}</div>

          {picked ? (
            <div className={`daily-locked ${today.my_side === 'YES' ? 'yes' : 'no'}`}>
              You're in — {money(Number(today.stake), { compact: true })} on <b>{today.my_side}</b>.
              Locked until midnight.
            </div>
          ) : (
            <>
              <div className="chips">
                <button className="btn btn-yes" disabled={busy} onClick={() => pick('YES')}>YES</button>
                <button className="btn btn-no" disabled={busy} onClick={() => pick('NO')}>NO</button>
              </div>
              <p className="faint center" style={{ fontSize: 12.5, margin: 0 }}>
                {money(Number(today.stake), { compact: true })} stake · one pick · winners split the pot
              </p>
            </>
          )}

          {today.participants?.length > 0 && (
            <>
              <hr className="divider" />
              <div className="prob-label" style={{ marginBottom: 8 }}>
                In today · {today.participants.length}
              </div>
              <div className="daily-people">
                {today.participants.map((p, i) => (
                  <span className="daily-person" key={i} title={p.username}>
                    <Avatar url={p.avatar_url} emoji={p.avatar_emoji} size={20} /> {p.username}
                  </span>
                ))}
              </div>
              <p className="faint" style={{ fontSize: 12, margin: '6px 0 0' }}>
                Picks stay hidden until it settles. No copying.
              </p>
            </>
          )}
        </div>
      )}

      <div className="section-head"><h2>Yesterday</h2></div>
      {yesterday ? (
        <div className="card stack">
          <div className="daily-q" style={{ fontSize: 16 }}>{yesterday.question}</div>
          <div>
            <span className={`badge ${yesterday.outcome === 'YES' ? 'badge-yes' : yesterday.outcome === 'NO' ? 'badge-no' : 'badge-void'}`}>
              {yesterday.outcome}
            </span>
            {yesterday.my_side && (
              <span style={{ marginLeft: 10, fontSize: 13.5 }} className={Number(yesterday.my_payout) > 0 ? 'v green' : 'muted'}>
                {yesterday.outcome === 'VOID'
                  ? 'voided — stake returned'
                  : Number(yesterday.my_payout) > 0
                    ? `you called it — won ${money(Number(yesterday.my_payout))}`
                    : `you said ${yesterday.my_side} — wrong, stake gone`}
              </span>
            )}
          </div>
          {yesterday.winners?.length > 0 ? (
            <div className="faint" style={{ fontSize: 13 }}>
              Winners: {yesterday.winners.map((w) => `${w.username} (${money(Number(w.payout), { compact: true })})`).join(' · ')}
            </div>
          ) : (
            yesterday.outcome !== 'VOID' && (
              <div className="faint" style={{ fontSize: 13 }}>Nobody called it. The house kept the pot. 🏦</div>
            )
          )}
        </div>
      ) : (
        <div className="note-box">No settled question yet — yesterday's result shows here.</div>
      )}

      <div className="spacer-lg" />
      <p className="faint center" style={{ fontSize: 12 }}>
        One question a day, same for everyone · resolves itself at midnight from the book's own numbers
      </p>
    </>
  )
}
