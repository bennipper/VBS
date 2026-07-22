import { useState } from 'react'
import { previewPrice, priceStr, signedPct } from '../lib/exchange.js'
import { MAX_MAGNITUDE, REASON_MIN_MAGNITUDE, REASON_MAX_CHARS, VOTE_BUDGET } from '../config.js'

// One event, not one tap per vote. Build magnitude on ▲/▼, add a reason,
// Confirm → a single cast_vote. Reason required at magnitude ≥ 3.
export default function VoteWidget({ price, remaining, halted, disabledReason, onVote }) {
  const [dir, setDir] = useState(null)   // 'UP' | 'DOWN'
  const [mag, setMag] = useState(0)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const cap = Math.min(MAX_MAGNITUDE, Math.max(0, remaining))

  function bump(d) {
    setErr('')
    if (halted && d === 'DOWN') return
    if (dir !== d) { setDir(d); setMag(1 > cap ? cap : 1); return }
    setMag((m) => Math.min(m + 1, cap))
  }
  function reset() { setDir(null); setMag(0); setReason(''); setErr('') }

  async function confirm() {
    setErr('')
    if (!dir || mag < 1) return
    if (mag >= REASON_MIN_MAGNITUDE && reason.trim().length === 0) {
      setErr(`A reason is required for votes of ${REASON_MIN_MAGNITUDE}+.`); return
    }
    setBusy(true)
    const e = await onVote(dir, mag, reason.trim())
    setBusy(false)
    if (e) { setErr(e); return }
    reset()
  }

  if (disabledReason) {
    return <div className="note-box">{disabledReason}</div>
  }

  const preview = dir ? previewPrice(price, dir, mag) : price
  const needReason = mag >= REASON_MIN_MAGNITUDE

  return (
    <div className="vote-widget">
      {err && <div className="error-box">{err}</div>}
      <div className="vote-controls">
        <button
          className={`vote-arrow up${dir === 'UP' ? ' on' : ''}`}
          onClick={() => bump('UP')}
          disabled={cap < 1}
          aria-label="Vote up"
        >▲</button>

        <div className="vote-mag">
          <div className={`vote-count tnum ${dir === 'UP' ? 'up' : dir === 'DOWN' ? 'down' : ''}`}>
            {dir ? `${dir === 'UP' ? '+' : '−'}${mag}` : '0'}
          </div>
          {dir && (
            <div className="vote-preview tnum">
              {priceStr(price)} → <b>{priceStr(preview)}</b> <span className={dir === 'UP' ? 'up' : 'down'}>({signedPct(price, preview)})</span>
            </div>
          )}
        </div>

        <button
          className={`vote-arrow down${dir === 'DOWN' ? ' on' : ''}`}
          onClick={() => bump('DOWN')}
          disabled={cap < 1 || halted}
          aria-label="Vote down"
          title={halted ? 'Trading halted — no more DOWN votes today' : undefined}
        >▼</button>
      </div>

      <div className="vote-budget faint tnum">{Math.max(0, remaining)} / {VOTE_BUDGET} units left today{halted ? ' · DOWN halted' : ''}</div>

      {dir && (
        <>
          <textarea
            className="textarea"
            rows={2}
            maxLength={REASON_MAX_CHARS}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={needReason ? 'Reason (required) — sign your commentary…' : 'Reason (optional)'}
          />
          <div className="chips">
            <button className="btn btn-primary" disabled={busy} onClick={confirm}>
              {busy ? <span className="spin" /> : `Confirm ${dir === 'UP' ? '+' : '−'}${mag}`}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={reset}>Clear</button>
          </div>
        </>
      )}
    </div>
  )
}
