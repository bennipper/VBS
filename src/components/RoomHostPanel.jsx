import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { AVATAR_BUCKET, AVATAR_MAX_BYTES } from '../config.js'
import { roomCode } from '../lib/format.js'
import Avatar from './Avatar.jsx'

function inviteLink(code) {
  return `${window.location.origin}/join/${code}`
}

// Host-only controls for a room: invite code, rename, picture, kick, delete.
export default function RoomHostPanel({ room, onChanged, onDeleted }) {
  const { user } = useAuth()
  const fileRef = useRef(null)

  const [members, setMembers] = useState([])
  const [name, setName] = useState(room.name)
  const [busy, setBusy] = useState('')      // which action is in flight
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [kickId, setKickId] = useState(null) // member pending kick confirmation

  const loadMembers = useCallback(async () => {
    const { data } = await supabase
      .from('room_members')
      .select('user_id, joined_at, balance, profile:profiles!user_id(username, avatar_url, avatar_emoji)')
      .eq('room_id', room.id)
      .order('joined_at', { ascending: true })
    setMembers(data ?? [])
  }, [room.id])

  useEffect(() => { loadMembers() }, [loadMembers])

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteLink(room.code))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked */ }
  }

  async function saveName() {
    setErr('')
    if (name.trim() === room.name) return
    setBusy('name')
    const { error } = await supabase.rpc('update_room', { p_room_id: room.id, p_name: name.trim() })
    setBusy('')
    if (error) { setErr(error.message); return }
    onChanged?.()
  }

  async function onPickPicture(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr('')
    if (!file.type.startsWith('image/')) { setErr('Pick an image file.'); return }
    if (file.size > AVATAR_MAX_BYTES) { setErr('Image too big — 5 MB max.'); return }
    setBusy('picture')
    // Path starts with the host's id to satisfy the avatars-bucket insert policy.
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${user.id}/room-${room.id}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from(AVATAR_BUCKET).upload(path, file, { cacheControl: '3600', upsert: true })
    if (upErr) { setErr(upErr.message); setBusy(''); if (e.target) e.target.value = ''; return }
    const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
    const { error } = await supabase.rpc('update_room', { p_room_id: room.id, p_avatar_url: pub.publicUrl })
    setBusy('')
    if (e.target) e.target.value = ''
    if (error) { setErr(error.message); return }
    onChanged?.()
  }

  async function kick(userId) {
    setErr('')
    setBusy('kick-' + userId)
    const { error } = await supabase.rpc('kick_member', { p_room_id: room.id, p_user_id: userId })
    setBusy('')
    setKickId(null)
    if (error) { setErr(error.message); return }
    loadMembers()
    onChanged?.()
  }

  async function remove() {
    setErr('')
    setBusy('delete')
    const { error } = await supabase.rpc('delete_room', { p_room_id: room.id })
    setBusy('')
    if (error) { setErr(error.message); return }
    onDeleted?.(room.id)
  }

  return (
    <div className="host-panel" onClick={(e) => e.stopPropagation()}>
      {err && <div className="error-box">{err}</div>}

      {/* Invite */}
      <div className="hp-section">
        <div className="hp-label">Invite code</div>
        <div className="row-between">
          <span className="tnum code-input" style={{ fontSize: 20, letterSpacing: '0.28em', textAlign: 'left' }}>{roomCode(room.code)}</span>
          <button className="btn btn-ghost btn-sm" onClick={copyInvite}>
            {copied ? '✓ Copied' : '🔗 Copy link'}
          </button>
        </div>
      </div>

      {/* Picture + rename */}
      <div className="hp-section">
        <div className="hp-label">Room name &amp; picture</div>
        <div className="avatar-upload" style={{ marginBottom: 10 }}>
          <button className="current" onClick={() => fileRef.current?.click()} disabled={busy === 'picture'} title="Change picture">
            <Avatar url={room.avatar_url} emoji="🚪" size={48} />
            <span className="avatar-edit-badge">{busy === 'picture' ? '…' : '✎'}</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden-file" onChange={onPickPicture} />
          <div style={{ flex: 1 }}>
            <input
              className="input"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        <button className="btn btn-primary btn-sm" disabled={busy === 'name' || name.trim() === room.name} onClick={saveName}>
          {busy === 'name' ? <span className="spin" /> : 'Save name'}
        </button>
      </div>

      {/* Members */}
      <div className="hp-section">
        <div className="hp-label">Players · {members.length}</div>
        <div className="stack" style={{ gap: 8 }}>
          {members.map((m) => {
            const isHost = m.user_id === room.host_id
            return (
              <div className="row-between hp-member" key={m.user_id}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Avatar url={m.profile?.avatar_url} emoji={m.profile?.avatar_emoji} size={24} />
                  <span>{m.profile?.username ?? 'punter'}</span>
                  {isHost && <span className="badge">host</span>}
                </span>
                {!isHost && (
                  kickId === m.user_id ? (
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="btn btn-no btn-sm" disabled={busy === 'kick-' + m.user_id} onClick={() => kick(m.user_id)}>
                        {busy === 'kick-' + m.user_id ? <span className="spin" /> : 'Remove'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setKickId(null)}>✕</button>
                    </span>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => setKickId(m.user_id)}>Remove</button>
                  )
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Danger */}
      <div className="hp-section hp-danger">
        <div className="hp-label">Danger zone</div>
        {confirmDelete ? (
          <>
            <div className="note-box" style={{ marginBottom: 8 }}>
              Delete <b>{room.name}</b> for everyone? All its markets, bets and balances are wiped. Can’t be undone.
            </div>
            <div className="chips">
              <button className="btn btn-no" disabled={busy === 'delete'} onClick={remove}>
                {busy === 'delete' ? <span className="spin" /> : 'Yes, delete room'}
              </button>
              <button className="btn btn-ghost" disabled={busy === 'delete'} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <button className="btn btn-ghost btn-sm hp-delete" onClick={() => setConfirmDelete(true)}>🗑 Delete room</button>
        )}
      </div>
    </div>
  )
}
