import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import { useRoom } from '../context/RoomContext.jsx'
import { previewBet, probYes } from '../lib/cpmm.js'
import { money, priceLabel, pct, shares as fmtShares } from '../lib/format.js'
import { QUICK_CHIPS } from '../config.js'

export default function BetSlip({ market, poolYes, poolNo, balance, initialSide, onPlaced }) {
  const { refreshRooms } = useRoom()
  const [side, setSide] = useState(initialSide === 'NO' ? 'NO' : 'YES')
  const [amount, setAmount] = useState('')
  const [chip, setChip] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const numAmount = Number(amount) || 0
  const preview = useMemo(
    () => previewBet(poolYes, poolNo, side, numAmount),
    [poolYes, poolNo, side, numAmount]
  )
  const currentProb = probYes(poolYes, poolNo)

  function setChipAmount(val) {
    if (val === 'ALL') {
      setAmount(String(Math.floor(balance)))
      setChip('ALL')
    } else {
      setAmount(String(val))
      setChip(val)
    }
  }

  const valid = numAmount > 0 && numAmount <= balance

  async function placeBet() {
    setError('')
    if (numAmount <= 0) return setError('Enter a stake.')
    if (numAmount > balance) return setError('Not enough in the pot. Claim a bailout?')

    setBusy(true)
    const { error: err } = await supabase.rpc('place_bet', {
      p_market_id: market.id,
      p_side: side,
      p_amount: numAmount,
    })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setAmount('')
    setChip(null)
    refreshRooms()
    onPlaced?.()
  }

  return (
    <>
      <div className="section-head">
        <h2>Bet slip</h2>
        <span className="faint tnum" style={{ fontSize: 12 }}>balance {money(balance, { compact: true })}</span>
      </div>

      <div className="card stack">
        {error && <div className="error-box">{error}</div>}

        {/* Side toggle */}
        <div className="quickbet">
          <button
            className={`qb qb-yes${side === 'YES' ? ' sel' : ''}`}
            onClick={() => setSide('YES')}
          >
            <span className="side">YES</span>
            <span className="price tnum">{priceLabel(currentProb)}</span>
          </button>
          <button
            className={`qb qb-no${side === 'NO' ? ' sel' : ''}`}
            onClick={() => setSide('NO')}
          >
            <span className="side">NO</span>
            <span className="price tnum">{priceLabel(1 - currentProb)}</span>
          </button>
        </div>

        {/* Stake */}
        <div className="field" style={{ margin: 0 }}>
          <label>Stake</label>
          <input
            className="input tnum"
            type="number"
            inputMode="decimal"
            min="0"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setChip(null) }}
            placeholder="0"
          />
        </div>

        <div className="chips">
          {QUICK_CHIPS.map((c) => (
            <button
              key={c}
              className={`chip${chip === c ? ' sel' : ''}`}
              onClick={() => setChipAmount(c)}
            >
              {money(c, { compact: true })}
            </button>
          ))}
          <button
            className={`chip allin${chip === 'ALL' ? ' sel' : ''}`}
            onClick={() => setChipAmount('ALL')}
          >
            ALL IN
          </button>
        </div>

        {/* Live preview */}
        {numAmount > 0 && (
          <div>
            <div className="slip-row">
              <span className="k">Shares</span>
              <span className="v tnum">{fmtShares(preview.shares)}</span>
            </div>
            <div className="slip-row">
              <span className="k">Avg price</span>
              <span className="v tnum">{priceLabel(preview.avgPrice)}</span>
            </div>
            <div className="slip-row">
              <span className="k">Margin <span className="faint">(2%)</span></span>
              <span className="v tnum faint">−{money(preview.fee)}</span>
            </div>
            <div className="slip-row">
              <span className="k">Payout if {side}</span>
              <span className="v tnum big green">{money(preview.payout)}</span>
            </div>
            <div className="slip-row">
              <span className="k">New odds</span>
              <span className="v tnum">
                {pct(currentProb)} → {pct(preview.probAfter)} YES
              </span>
            </div>
          </div>
        )}

        <button
          className={`btn ${side === 'YES' ? 'btn-yes' : 'btn-no'}`}
          disabled={busy || !valid}
          onClick={placeBet}
        >
          {busy ? (
            <span className="spin" />
          ) : (
            <>Punt {money(numAmount || 0, { compact: true })} on {side}</>
          )}
        </button>
      </div>
    </>
  )
}
