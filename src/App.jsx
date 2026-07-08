import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { isConfigured } from './lib/supabase.js'
import Layout from './components/Layout.jsx'
import Auth from './pages/Auth.jsx'
import Feed from './pages/Feed.jsx'
import MarketDetail from './pages/MarketDetail.jsx'
import CreateMarket from './pages/CreateMarket.jsx'
import Profile from './pages/Profile.jsx'
import Leaderboard from './pages/Leaderboard.jsx'
import Casino from './pages/Casino.jsx'
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
    // Everything routes to auth until you're in.
    if (location.pathname !== '/auth') return <Navigate to="/auth" replace />
    return <Auth />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Feed />} />
        <Route path="/market/:id" element={<MarketDetail />} />
        <Route path="/create" element={<CreateMarket />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/casino" element={<Casino />} />
        <Route path="/me" element={<Profile />} />
        <Route path="/u/:id" element={<Profile />} />
        <Route path="/auth" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
