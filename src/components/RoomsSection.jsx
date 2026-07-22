import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useRoom } from '../context/RoomContext.jsx'
import { money, roomCode } from '../lib/format.js'
import Avatar from './Avatar.jsx'
import RoomHostPanel from './RoomHostPanel.jsx'

function inviteLink(code) {
  return `${window.location.origin}/join/${code}`
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// Rooms management — lives inside the Account (Profile) page.
export default function RoomsSection() {
  const { user } = useAuth()
  const { rooms, activeRoomId, setActiveRoomId, refreshRooms } = useRoom()
  const navigate = useNavigate()

  const [memberCounts, setMemberCounts] = useState({})
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [copiedCode, setCopiedCode] = useState(null)
  const [panelRoomId, setPanelRoomId] = useState(null)

  useEffect(() => {
    async function load() {
      if (rooms.length === 0) return
      const ids = rooms.map((r) => r.room_id)
      const { data } = await supabase.from('room_members').select('room_id').in('room_id', ids)
      const counts = {}
      for (const row of data ?? []) counts[row.room_id] = (counts[row.room_id] ?? 0) + 1
      setMemberCounts(counts)
    }
    load()
  }, [rooms])

  function openRoom(id) {
    setActiveRoomId(id)
    navigate('/')
  }

  async function handleDeleted(deletedId) {
    setPanelRoomId(null)
    setNotice('Room deleted.')
    const list = await refreshRooms()
    if (activeRoomId === deletedId) {
      setActiveRoomId(list.find((r) => r.room_id !== deletedId)?.room_id ?? null)
    }
  }

  async function createRoom(e) {
    e.preventDefault()
    setErr('')
    setNotice('')
    if (newName.trim().length < 3) {
      setErr('Give the room a proper name (3+ characters).')
      return
    }
    setBusy(true)
    const { data, error } = await supabase.rpc('create_room', { p_name: newName.trim() })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setNewName('')
    setCreating(false)
    await refreshRooms()
    setActiveRoomId(data.room_id)
    const ok = await copyText(inviteLink(data.code))
    setNotice(
      ok
        ? `Room made — code ${roomCode(data.code)}. Invite link copied, send it to the group chat.`
        : `Room made — code ${roomCode(data.code)}. Share the code or the invite link below.`
    )
  }

  async function joinByCode(e) {
    e.preventDefault()
    setErr('')
    setNotice('')
    const code = joinCode.replace(/\D/g, '')
    if (code.length !== 8) {
      setErr('Room codes are 8 digits.')
      return
    }
    setBusy(true)
    const { data, error } = await supabase.rpc('join_room', { p_code: code })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setJoinCode('')
    await refreshRooms()
    setActiveRoomId(data.room_id)
    if (data.joined) {
      navigate('/')
    } else {
      setNotice(`You're already in ${data.name} — switched to it.`)
    }
  }

  async function copyInvite(code) {
    const ok = await copyText(inviteLink(code))
    if (ok) {
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 1800)
    }
  }

  return (
    <>
      <div className="section-head"><h2>Your rooms</h2></div>

      {err && <div className="error-box">{err}</div>}
      {notice && <div className="note-box" style={{ marginBottom: 12 }}>{notice}</div>}

      {rooms.length === 0 ? (
        <div className="empty">
          <div className="big">🚪</div>
          <p>You're not in any rooms yet.<br />Make one for your mates, or join with a code.</p>
        </div>
      ) : (
        <div className="stack">
          {rooms.map((r) => {
            const isActive = r.room_id === activeRoomId
            const isHost = r.room?.host_id === user?.id
            return (
              <div
                key={r.room_id}
                className={`card room-card${isActive ? ' active' : ''}`}
                onClick={() => openRoom(r.room_id)}
                role="button"
              >
                <div className="row-between">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <Avatar url={r.room?.avatar_url} emoji="🚪" size={44} className="room-av" />
                    <div style={{ minWidth: 0 }}>
                      <div className="room-name">
                        {r.room?.name}
                        {isHost && <span className="badge" style={{ marginLeft: 8 }}>host</span>}
                        {isActive && <span className="badge badge-yes" style={{ marginLeft: 6 }}>active</span>}
                      </div>
                      <div className="faint" style={{ fontSize: 12.5, marginTop: 3 }}>
                        {memberCounts[r.room_id] ?? '…'} punters · code <span className="tnum">{roomCode(r.room?.code)}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <div className="tnum room-bal">{money(Number(r.balance), { compact: true })}</div>
                    {isHost && (
                      <button
                        className="room-dots"
                        title="Host controls"
                        onClick={(e) => { e.stopPropagation(); setPanelRoomId(panelRoomId === r.room_id ? null : r.room_id) }}
                      >
                        ⋯
                      </button>
                    )}
                  </div>
                </div>
                <div className="room-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm" onClick={() => copyInvite(r.room?.code)}>
                    {copiedCode === r.room?.code ? '✓ Link copied' : '🔗 Copy invite link'}
                  </button>
                  {isActive ? (
                    <button className="btn btn-sm btn-joined" disabled>✓ Joined</button>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={() => openRoom(r.room_id)}>
                      Enter
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {panelRoomId && (() => {
        const r = rooms.find((x) => x.room_id === panelRoomId)
        if (!r) return null
        return (
          <div className="modal-backdrop" onClick={() => setPanelRoomId(null)}>
            <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>Host controls · {r.room?.name}</h3>
                <button className="modal-close" onClick={() => setPanelRoomId(null)} aria-label="Close">✕</button>
              </div>
              <RoomHostPanel room={r.room} onChanged={refreshRooms} onDeleted={handleDeleted} />
            </div>
          </div>
        )
      })()}

      <div className="section-head"><h2>Make a room</h2></div>
      {creating ? (
        <form className="card stack" onSubmit={createRoom}>
          <div className="field" style={{ margin: 0 }}>
            <label>Room name</label>
            <input
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="The Lads"
              maxLength={40}
              autoFocus
            />
            <div className="hint">You'll be the host. Everyone starts with £1,000 in here.</div>
          </div>
          <div className="chips">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? <span className="spin" /> : 'Make room'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="btn btn-primary" onClick={() => { setCreating(true); setErr(''); setNotice('') }}>
          Make a room
        </button>
      )}

      <div className="section-head"><h2>Join a room</h2></div>
      <form className="card stack" onSubmit={joinByCode}>
        <div className="field" style={{ margin: 0 }}>
          <label>Room code</label>
          <input
            className="input tnum code-input"
            inputMode="numeric"
            autoComplete="off"
            value={roomCode(joinCode)}
            onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="0000 0000"
          />
          <div className="hint">The 8-digit code from your mate's room.</div>
        </div>
        <button className="btn btn-primary" disabled={busy || joinCode.length !== 8}>
          {busy ? <span className="spin" /> : 'Join room'}
        </button>
      </form>
    </>
  )
}
