import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useRoom } from '../context/RoomContext.jsx'
import Avatar from '../components/Avatar.jsx'
import { TICKER_TYPES } from '../config.js'

// Symbol suggestion: uppercase alnum, strip vowels if it won't fit in 5.
function suggestSymbol(name) {
  const clean = (name || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (clean.length <= 5) return clean
  const noVowels = clean.replace(/[AEIOU]/g, '')
  return (noVowels.length >= 2 ? noVowels : clean).slice(0, 5)
}

export default function CreateTicker() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { activeRoomId, activeRoom } = useRoom()

  const [type, setType] = useState('member')
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [symbolEdited, setSymbolEdited] = useState(false)
  const [subjectId, setSubjectId] = useState('')
  const [members, setMembers] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!activeRoomId) return
    supabase.from('room_members')
      .select('user_id, profile:profiles!user_id(username, avatar_url, avatar_emoji)')
      .eq('room_id', activeRoomId)
      .then(({ data }) => setMembers(data ?? []))
  }, [activeRoomId])

  // Keep the symbol suggestion in sync until the user edits it by hand.
  useEffect(() => {
    if (!symbolEdited) setSymbol(suggestSymbol(name))
  }, [name, symbolEdited])

  const typeMeta = useMemo(() => TICKER_TYPES.find((t) => t.key === type), [type])

  function pickType(k) {
    setType(k)
    setErr('')
    if (k !== 'member') { setSubjectId('') }
  }

  function pickMember(uid) {
    setSubjectId(uid)
    const m = members.find((x) => x.user_id === uid)
    if (m?.profile?.username) {
      setName(m.profile.username)
      setSymbolEdited(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    setErr('')
    const sym = symbol.toUpperCase().trim()
    if (!/^[A-Z0-9]{2,5}$/.test(sym)) { setErr('Symbol must be 2–5 letters or digits.'); return }
    if (name.trim().length < 1) { setErr('Give it a name.'); return }
    if (type === 'member' && !subjectId) { setErr('Pick which member this ticker is for.'); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('create_ticker', {
      p_room_id: activeRoomId,
      p_symbol: sym,
      p_name: name.trim(),
      p_type: type,
      p_subject_user_id: type === 'member' ? subjectId : null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    navigate(`/ticker/${data}`)
  }

  if (!activeRoomId) {
    return (
      <div className="empty" style={{ paddingTop: 60 }}>
        <div className="big">🚪</div>
        <p>Pick a room first.</p>
      </div>
    )
  }

  return (
    <>
      <div style={{ marginTop: 16 }}>
        <button className="faint" onClick={() => navigate(-1)} style={{ fontSize: 13 }}>← Back</button>
      </div>
      <div className="section-head"><h2>List a ticker · {activeRoom?.name}</h2></div>

      <form className="card stack" onSubmit={submit}>
        {err && <div className="error-box">{err}</div>}

        {/* Type */}
        <div className="field" style={{ margin: 0 }}>
          <label>Type</label>
          <div className="chips">
            {TICKER_TYPES.map((t) => (
              <button
                type="button"
                key={t.key}
                className={`btn btn-sm ${type === t.key ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => pickType(t.key)}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
          <div className="hint">{typeMeta?.hint}</div>
        </div>

        {/* Member subject */}
        {type === 'member' && (
          <div className="field" style={{ margin: 0 }}>
            <label>Who?</label>
            <div className="stack" style={{ gap: 6 }}>
              {members.map((m) => (
                <button
                  type="button"
                  key={m.user_id}
                  className={`member-pick${subjectId === m.user_id ? ' sel' : ''}`}
                  onClick={() => pickMember(m.user_id)}
                >
                  <Avatar url={m.profile?.avatar_url} emoji={m.profile?.avatar_emoji} size={24} />
                  <span>{m.profile?.username ?? 'punter'}</span>
                  {m.user_id === user?.id && <span className="faint" style={{ fontSize: 12 }}>(you — can't vote your own)</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Name */}
        <div className="field" style={{ margin: 0 }}>
          <label>{type === 'person' ? 'Nickname (not a real name)' : 'Name'}</label>
          <input
            className="input"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === 'thing' ? 'The office fridge' : type === 'concept' ? 'Monday' : type === 'person' ? 'The 07:42 snorer' : 'Dave'}
          />
          {type === 'person' && (
            <div className="hint">Use an archetype, not an identifiable name — the fun is in the nickname.</div>
          )}
        </div>

        {/* Symbol */}
        <div className="field" style={{ margin: 0 }}>
          <label>Symbol</label>
          <input
            className="input tnum"
            value={symbol}
            maxLength={5}
            onChange={(e) => { setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setSymbolEdited(true) }}
            placeholder="FRDG"
            style={{ letterSpacing: '0.15em', fontWeight: 700 }}
          />
          <div className="hint">2–5 chars · locked after listing</div>
        </div>

        <div className="note-box" style={{ fontSize: 12.5 }}>
          Opens at <b>100.00</b>. Anyone in {activeRoom?.name ?? 'the room'} can vote it up or down —
          and every vote is public, with your name on it.
        </div>

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <span className="spin" /> : `List ${symbol || 'ticker'}`}
        </button>
      </form>
    </>
  )
}
