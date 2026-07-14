import { NavLink, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useRoom } from '../context/RoomContext.jsx'
import { APP_NAME } from '../config.js'
import { money } from '../lib/format.js'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'

function NavItem({ to, ico, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      title={label}
      className={({ isActive }) => `navitem${isActive ? ' active' : ''}`}
    >
      <span className="ico">{ico}</span>
    </NavLink>
  )
}

export default function Layout({ children }) {
  const { profile } = useAuth()
  const { activeRoom, balance } = useRoom()
  const location = useLocation()

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="wordmark" aria-label={APP_NAME}>
            <img src="/tightpunt-logo.svg" alt={APP_NAME} className="logo" />
          </Link>
          <Link to="/me" className="bal-pill tnum" title={activeRoom ? `Your balance in ${activeRoom.name}` : 'Your profile'}>
            <Avatar url={profile?.avatar_url} emoji={profile?.avatar_emoji} size={18} />
            {activeRoom ? money(balance, { compact: true }) : profile?.username ?? 'you'}
          </Link>
        </div>
      </header>

      <main className="shell" key={location.pathname}>
        {children}
        <div className="spacer-xl" />
      </main>

      <nav className="bottomnav">
        <div className="bottomnav-inner">
          <NavItem to="/" ico={<Icon name="market" />} label="Markets" end />
          <NavItem to="/leaderboard" ico={<Icon name="table" />} label="Table" />
          <NavItem to="/create" ico={<Icon name="plus" />} label="New" />
          <NavItem to="/rooms" ico={<Icon name="rooms" />} label="Rooms" />
          <NavItem to="/me" ico={<Icon name="you" />} label="You" />
        </div>
      </nav>
    </div>
  )
}
