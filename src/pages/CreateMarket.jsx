import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { seedPools } from '../lib/cpmm.js'
import { SEED_LIQUIDITY } from '../config.js'

export default function CreateMarket() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [startProb, setStartProb] = useState(50)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    const q = question.trim()
    if (q.length < 3) {
      setError('Give the market a proper question.')
      return
    }

    const { poolYes, poolNo } = seedPools(startProb / 100, SEED_LIQUIDITY)

    setBusy(true)
    const { data, error: err } = await supabase
      .from('markets')
      .insert({
        creator_id: user.id,
        question: q,
        description: description.trim() || null,
        pool_yes: poolYes,
        pool_no: poolNo,
        closes_at: closesAt ? new Date(closesAt).toISOString() : null,
      })
      .select('id')
      .single()
    setBusy(false)

    if (err) {
      setError(err.message)
      return
    }
    navigate(`/market/${data.id}`)
  }

  return (
    <>
      <div className="section-head">
        <h2>Open a market</h2>
      </div>

      <form className="card stack" onSubmit={submit}>
        {error && <div className="error-box">{error}</div>}

        <div className="field">
          <label>The question</label>
          <input
            className="input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Will Dave burp before 9pm?"
            maxLength={200}
            autoFocus
          />
          <div className="hint">Keep it binary. It resolves YES or NO.</div>
        </div>

        <div className="field">
          <label>Resolution criteria <span className="faint">(optional)</span></label>
          <textarea
            className="textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Resolves YES if an audible burp is witnessed by two or more people before 21:00."
            maxLength={500}
          />
        </div>

        <div className="field">
          <label>Betting closes <span className="faint">(optional)</span></label>
          <input
            className="input"
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
          />
          <div className="hint">Leave blank to keep it open until you resolve it.</div>
        </div>

        <div className="field">
          <label>
            Starting odds · <span className="tnum">{startProb}%</span> YES
          </label>
          <input
            type="range"
            min="1"
            max="99"
            value={startProb}
            onChange={(e) => setStartProb(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--paper)' }}
          />
          <div className="hint">Default 50/50. The house seeds the liquidity — costs you nothing.</div>
        </div>

        <button className="btn btn-primary" disabled={busy}>
          {busy ? <span className="spin" /> : 'Open the market'}
        </button>
      </form>
    </>
  )
}
