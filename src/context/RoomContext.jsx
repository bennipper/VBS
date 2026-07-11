import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from './AuthContext.jsx'

// Rooms are the tenancy boundary: every market, balance, and leaderboard is
// scoped to one. The active room drives what the whole app shows.
const RoomContext = createContext(null)

const ACTIVE_KEY = 'tp_active_room'
export const PENDING_JOIN_KEY = 'tp_pending_join'

export function RoomProvider({ children }) {
  const { user } = useAuth()
  const [rooms, setRooms] = useState([]) // [{ room_id, balance, bailout_count, room: {id,name,code,host_id} }]
  const [activeRoomId, setActiveRoomIdState] = useState(() => localStorage.getItem(ACTIVE_KEY))
  const [loading, setLoading] = useState(true)

  const setActiveRoomId = useCallback((id) => {
    setActiveRoomIdState(id)
    if (id) localStorage.setItem(ACTIVE_KEY, id)
    else localStorage.removeItem(ACTIVE_KEY)
  }, [])

  const refreshRooms = useCallback(async () => {
    if (!user) {
      setRooms([])
      setLoading(false)
      return []
    }
    const { data } = await supabase
      .from('room_members')
      .select('room_id, balance, bailout_count, room:rooms(id, name, code, host_id)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: true })
    const list = data ?? []
    setRooms(list)
    setLoading(false)
    return list
  }, [user])

  // Initial load + auto-pick an active room; honour a pending invite link.
  useEffect(() => {
    let cancelled = false
    async function init() {
      const pending = localStorage.getItem(PENDING_JOIN_KEY)
      if (user && pending) {
        localStorage.removeItem(PENDING_JOIN_KEY)
        const { data } = await supabase.rpc('join_room', { p_code: pending })
        if (!cancelled && data?.room_id) setActiveRoomId(data.room_id)
      }
      const list = await refreshRooms()
      if (cancelled) return
      // Ensure the stored active room is one we actually belong to.
      const stored = localStorage.getItem(ACTIVE_KEY)
      const valid = list.some((r) => r.room_id === stored)
      if (!valid) setActiveRoomId(list[0]?.room_id ?? null)
    }
    init()
    return () => {
      cancelled = true
    }
  }, [user, refreshRooms, setActiveRoomId])

  // Live balance updates for any of my memberships.
  useEffect(() => {
    if (!user) return
    const ch = supabase
      .channel(`rm-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'room_members', filter: `user_id=eq.${user.id}` },
        () => refreshRooms()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [user, refreshRooms])

  const active = useMemo(
    () => rooms.find((r) => r.room_id === activeRoomId) ?? null,
    [rooms, activeRoomId]
  )

  const value = {
    rooms,
    loading,
    activeRoomId: active?.room_id ?? null,
    activeRoom: active?.room ?? null,
    balance: active ? Number(active.balance) : 0,
    bailoutCount: active ? active.bailout_count : 0,
    isHost: Boolean(active && user && active.room?.host_id === user.id),
    setActiveRoomId,
    refreshRooms,
  }

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>
}

export function useRoom() {
  const ctx = useContext(RoomContext)
  if (!ctx) throw new Error('useRoom must be used within RoomProvider')
  return ctx
}
