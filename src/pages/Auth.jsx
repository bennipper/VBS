import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { APP_NAME, APP_TAGLINE, AVATAR_EMOJIS, DEFAULT_AVATAR, STARTING_BALANCE } from '../config.js'
import { money } from '../lib/format.js'

export default function Auth() {
  const [mode, setMode] = useState('signup') // 'signup' | 'login'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [emoji, setEmoji] = useState(DEFAULT_AVATAR)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setNotice('')

    if (mode === 'signup') {
      const uname = username.trim()
      if (uname.length < 3 || uname.length > 20) {
        setError('Username must be 3–20 characters.')
        return
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.')
        return
      }
      setBusy(true)
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username: uname, avatar_emoji: emoji } },
      })
      setBusy(false)
      if (err) {
        setError(err.message)
        return
      }
      // If email confirmation is on, there's no session yet.
      if (!data.session) {
        setNotice('Check your email to confirm, then log in.')
        setMode('login')
      }
      // Otherwise onAuthStateChange takes it from here.
    } else {
      setBusy(true)
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      setBusy(false)
      if (err) setError(err.message)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-brand">
        <div className="mk">{APP_NAME}</div>
        <div className="tag">{APP_TAGLINE}</div>
      </div>

      <form className="card stack" onSubmit={submit}>
        <h2 style={{ marginBottom: 2 }}>{mode === 'signup' ? 'Open an account' : 'Log in'}</h2>
        <p className="faint" style={{ margin: 0, fontSize: 13 }}>
          {mode === 'signup'
            ? `New punters start with ${money(STARTING_BALANCE, { compact: true })} on the house.`
            : 'Welcome back. Try not to go skint.'}
        </p>

        {error && <div className="error-box">{error}</div>}
        {notice && <div className="note-box">{notice}</div>}

        {mode === 'signup' && (
          <div className="field">
            <label>Username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="dave_the_degenerate"
              autoCapitalize="none"
              maxLength={20}
            />
          </div>
        )}

        <div className="field">
          <label>Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
          />
        </div>

        <div className="field">
          <label>Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
        </div>

        {mode === 'signup' && (
          <div className="field">
            <label>Pick your mug</label>
            <div className="emoji-grid">
              {AVATAR_EMOJIS.map((em) => (
                <button
                  type="button"
                  key={em}
                  className={`emoji-btn${emoji === em ? ' sel' : ''}`}
                  onClick={() => setEmoji(em)}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        )}

        <button className="btn btn-primary" disabled={busy}>
          {busy ? <span className="spin" /> : mode === 'signup' ? 'Sign me up' : 'Log in'}
        </button>
      </form>

      <div className="auth-toggle">
        {mode === 'signup' ? (
          <>
            Already have an account?{' '}
            <button className="link-red" onClick={() => { setMode('login'); setError('') }}>
              Log in
            </button>
          </>
        ) : (
          <>
            New here?{' '}
            <button className="link-red" onClick={() => { setMode('signup'); setError('') }}>
              Open an account
            </button>
          </>
        )}
      </div>
    </div>
  )
}
