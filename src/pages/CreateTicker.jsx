import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useRoom } from '../context/RoomContext.jsx'

// Symbol suggestion: uppercase alnum, strip vowels if it won't fit in 5.
function suggestSymbol(name) {
  const clean = (name || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (clean.length <= 5) return clean
  const noVowels = clean.replace(/[AEIOU]/g, '')
  return (noVowels.length >= 2 ? noVowels : clean).slice(0, 5)
}

export default function CreateTicker() {
  const navigate = useNavigate()
  const { activeRoomId, activeRoom } = useRoom()

  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [symbolEdited, setSymbolEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Keep the symbol suggestion in sync until the user edits it by hand.
  useEffect(() => {
    if (!symbolEdited) setSymbol(suggestSymbol(name))
  }, [name, symbolEdited])

  async function submit(e) {
    e.preventDefault()
    setErr('')
    const sym = symbol.toUpperCase().trim()
    if (!/^[A-Z0-9]{2,5}$/.test(sym)) { setErr('Symbol must be 2–5 letters or digits.'); return }
    if (name.trim().length < 1) { setErr('Give it a nickname.'); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('create_ticker', {
      p_room_id: activeRoomId,
      p_symbol: sym,
      p_name: name.trim(),
      p_type: 'person',
      p_subject_user_id: null,
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

        {/* Nickname */}
        <div className="field" style={{ margin: 0 }}>
          <label>Nickname</label>
          <input
            className="input"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="The 07:42 snorer"
            autoFocus
          />
          <div className="hint">Use a nickname, not a real name — the fun is in the archetype.</div>
        </div>

        {/* Symbol */}
        <div className="field" style={{ margin: 0 }}>
          <label>Symbol</label>
          <input
            className="input tnum"
            value={symbol}
            maxLength={5}
            onChange={(e) => { setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setSymbolEdited(true) }}
            placeholder="SNOR"
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
