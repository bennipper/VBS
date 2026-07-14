import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { teamFlag } from '../config.js'
import { timeLeft } from '../lib/format.js'

// Promotes the next/current major event on the feed. Tapping slides through to
// the dedicated event page full of house-owned bets.
export default function EventBanner() {
  const navigate = useNavigate()
  const [ev, setEv] = useState(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('events')
      .select('*')
      .neq('status', 'settled')
      .order('kickoff_at', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setEv(data ?? null)
      })
    return () => {
      alive = false
    }
  }, [])

  if (!ev) return null

  const live = ev.status === 'live' || new Date(ev.kickoff_at) <= new Date()

  return (
    <button
      className="event-banner"
      style={{ '--accent': ev.accent }}
      onClick={() => navigate(`/event/${ev.slug}`)}
    >
      <div className="eb-flags">
        <span>{teamFlag(ev.home_team)}</span>
        <span className="eb-vs">v</span>
        <span>{teamFlag(ev.away_team)}</span>
      </div>
      <div className="eb-body">
        <div className="eb-title">{ev.title}</div>
        <div className="eb-sub">
          {live ? (
            <span className="eb-live">● LIVE</span>
          ) : (
            <>Kicks off {timeLeft(ev.kickoff_at)}</>
          )}
          {ev.subtitle ? ` · ${ev.subtitle}` : ''}
        </div>
      </div>
      <div className="eb-cta">Punt →</div>
    </button>
  )
}
