import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { RoomProvider, PENDING_JOIN_KEY } from './context/RoomContext.jsx'
import { isConfigured } from './lib/supabase.js'
import Layout from './components/Layout.jsx'
import Auth from './pages/Auth.jsx'
import Feed from './pages/Feed.jsx'
import MarketDetail from './pages/MarketDetail.jsx'
import CreateMarket from './pages/CreateMarket.jsx'
import Profile from './pages/Profile.jsx'
import Leaderboard from './pages/Leaderboard.jsx'
import Rooms from './pages/Rooms.jsx'
import JoinRoom from './pages/JoinRoom.jsx'
import EventPage from './pages/EventPage.jsx'
import NotConfigured from './components/NotConfigured.jsx'

export default function App() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (!isConfigured) return <NotConfigured />

  if (loading) {
    return (
      <div className="loading-full">
        <div className="spin" />
      </div>
    )
  }

  if (!session) {
    // Invite link while logged out: remember the code, join after auth.
    const joinMatch = location.pathname.match(/^\/join\/(\d{4,12})$/)
    if (joinMatch) {
      localStorage.setItem(PENDING_JOIN_KEY, joinMatch[1])
      return <Navigate to="/auth" replace />
    }
    if (location.pathname !== '/auth') return <Navigate to="/auth" replace />
    return <Auth />
  }

  return (
    <RoomProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Feed />} />
          <Route path="/event/:slug" element={<EventPage />} />
          <Route path="/market/:id" element={<MarketDetail />} />
          <Route path="/create" element={<CreateMarket />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/rooms" element={<Rooms />} />
          <Route path="/join/:code" element={<JoinRoom />} />
          <Route path="/me" element={<Profile />} />
          <Route path="/u/:id" element={<Profile />} />
          <Route path="/daily" element={<Navigate to="/rooms" replace />} />
          <Route path="/casino" element={<Navigate to="/rooms" replace />} />
          <Route path="/auth" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </RoomProvider>
  )
}
