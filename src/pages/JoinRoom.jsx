import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useRoom } from '../context/RoomContext.jsx'

// Landing page for invite links: /join/12345678
// (Logged-out visitors never reach this — App stores the code and sends them
// to auth; RoomProvider joins automatically after login.)
export default function JoinRoom() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { setActiveRoomId, refreshRooms } = useRoom()
  const [err, setErr] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    async function go() {
      const clean = (code ?? '').replace(/\D/g, '')
      if (clean.length !== 8) {
        setErr('That invite link looks wrong — codes are 8 digits.')
        return
      }
      const { data, error } = await supabase.rpc('join_room', { p_code: clean })
      if (error) {
        setErr(error.message)
        return
      }
      await refreshRooms()
      setActiveRoomId(data.room_id)
      navigate('/', { replace: true })
    }
    go()
  }, [code, navigate, refreshRooms, setActiveRoomId])

  return (
    <div className="loading-full" style={{ flexDirection: 'column', gap: 16 }}>
      {err ? (
        <>
          <div className="error-box">{err}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/rooms')}>
            Go to rooms
          </button>
        </>
      ) : (
        <>
          <div className="spin" />
          <span className="faint" style={{ fontSize: 14 }}>Joining room…</span>
        </>
      )}
    </div>
  )
}
