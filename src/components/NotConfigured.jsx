import { APP_NAME } from '../config.js'

export default function NotConfigured() {
  return (
    <div className="auth-wrap">
      <div className="auth-brand">
        <div className="mk">{APP_NAME}</div>
      </div>
      <div className="card stack">
        <h2>Almost there</h2>
        <p className="muted" style={{ margin: 0 }}>
          Supabase isn't wired up yet. Create a project, run{' '}
          <code>supabase/schema.sql</code> in the SQL editor, then add your keys to{' '}
          <code>.env.local</code>:
        </p>
        <pre
          className="note-box"
          style={{ fontFamily: 'var(--font-num)', whiteSpace: 'pre-wrap', overflowX: 'auto' }}
        >
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...`}
        </pre>
        <p className="faint" style={{ margin: 0, fontSize: 13 }}>
          Restart <code>npm run dev</code> after saving. See <code>README.md</code> for the
          full walkthrough.
        </p>
      </div>
    </div>
  )
}
