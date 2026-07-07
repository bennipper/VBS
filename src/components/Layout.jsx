import { NavLink, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { APP_NAME } from '../config.js'
import { money } from '../lib/format.js'

function NavItem({ to, ico, label, end }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `navitem${isActive ? ' active' : ''}`}>
      <span className="ico">{ico}</span>
      <span>{label}</span>
    </NavLink>
  )
}

export default function Layout({ children }) {
  const { profile } = useAuth()
  const location = useLocation()

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="wordmark">
            <span className="tick">▪</span>
            {APP_NAME}
            <small>bookmaker</small>
          </Link>
          <Link to="/me" className="bal-pill tnum" title="Your balance">
            <span className="em">{profile?.avatar_emoji ?? '🎲'}</span>
            {money(profile?.balance ?? 0, { compact: true })}
          </Link>
        </div>
      </header>

      <main className="shell" key={location.pathname}>
        {children}
        <div className="spacer-xl" />
      </main>

      <nav className="bottomnav">
        <div className="bottomnav-inner">
          <NavItem to="/" ico="📋" label="Markets" end />
          <NavItem to="/leaderboard" ico="🏆" label="Table" />
          <NavItem to="/create" ico="➕" label="New" />
          <NavItem to="/me" ico="👤" label="You" />
        </div>
      </nav>
    </div>
  )
}
