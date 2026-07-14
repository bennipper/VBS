import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useRoom } from '../context/RoomContext.jsx'
import MarketCard from '../components/MarketCard.jsx'
import { teamFlag } from '../config.js'
import { timeLeft } from '../lib/format.js'

// A dedicated page of house-owned bets for one major event. Markets are seeded
// into the active room on first visit; anyone in the room can punt on them and
// they auto-settle from the match result.
export default function EventPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { activeRoomId, activeRoom } = useRoom()

  const [event, setEvent] = useState(null)
  const [markets, setMarkets] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const loadMarkets = useCallback(
    async (eventId) => {
      if (!eventId || !activeRoomId) return
      const { data } = await supabase
        .from('market_summary')
        .select('*')
        .eq('event_id', eventId)
        .eq('room_id', activeRoomId)
        .order('created_at', { ascending: true })
      setMarkets(data ?? [])
    },
    [activeRoomId]
  )

  useEffect(() => {
    let alive = true
    async function init() {
      setLoading(true)
      const { data: ev } = await supabase.from('events').select('*').eq('slug', slug).maybeSingle()
      if (!alive) return
      if (!ev) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setEvent(ev)
      if (activeRoomId) {
        // Make sure this room has the event's markets, then load them.
        await supabase.rpc('seed_event', { p_event_id: ev.id, p_room_id: activeRoomId })
        await loadMarkets(ev.id)
      }
      if (alive) setLoading(false)
    }
    init()
    return () => {
      alive = false
    }
  }, [slug, activeRoomId, loadMarkets])

  // Live odds as mates punt.
  useEffect(() => {
    if (!event || !activeRoomId) return
    const ch = supabase
      .channel(`event-${event.id}-${activeRoomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'markets' }, () => loadMarkets(event.id))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bets' }, () => loadMarkets(event.id))
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [event, activeRoomId, loadMarkets])

  if (loading) {
    return (
      <div className="page-enter-right loading-full">
        <div className="spin" />
      </div>
    )
  }

  if (notFound || !event) {
    return (
      <div className="page-enter-right empty">
        <div className="big">🤷</div>
        <p>That event has finished or doesn't exist.</p>
        <Link to="/" className="link-red">Back to the book</Link>
      </div>
    )
  }

  const live = event.status === 'live' || new Date(event.kickoff_at) <= new Date()

  return (
    <div className="page-enter-right">
      <div style={{ marginTop: 16 }}>
        <button className="faint" onClick={() => navigate(-1)} style={{ fontSize: 13 }}>← Back</button>
      </div>

      <div className="event-hero" style={{ '--accent': event.accent }}>
        <div className="eh-flags">
          <span>{teamFlag(event.home_team)}</span>
          <span className="eh-vs">v</span>
          <span>{teamFlag(event.away_team)}</span>
        </div>
        <h1 className="eh-title">{event.title}</h1>
        <div className="eh-meta">
          {live ? <span className="eb-live">● LIVE now</span> : <>Kicks off {timeLeft(event.kickoff_at)}</>}
          {event.subtitle ? ` · ${event.subtitle}` : ''}
        </div>
        <div className="eh-note">
          🎩 House markets · anyone can punt · auto-settles from the full-time result
        </div>
      </div>

      {!activeRoomId ? (
        <div className="empty">
          <div className="big">🚪</div>
          <p>Join or pick a room first to punt on these.</p>
          <Link to="/rooms" className="btn btn-primary btn-sm" style={{ display: 'inline-flex' }}>
            Go to rooms
          </Link>
        </div>
      ) : markets.length === 0 ? (
        <div className="empty">
          <div className="big">🎲</div>
          <p>No markets for this event in {activeRoom?.name ?? 'this room'} yet.</p>
        </div>
      ) : (
        <div className="stack">
          {markets.map((m) => (
            <MarketCard key={m.id} m={m} />
          ))}
        </div>
      )}

      <div className="spacer-lg" />
    </div>
  )
}
