import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { money } from '../lib/format.js'

const SLOT_SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣']
const CHIPS = [10, 25, 50, 100]
const randSym = () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]

// ---- card helpers (code 0..51) --------------------------------------------
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUITS = ['♠', '♥', '♦', '♣']
function Card({ code, hidden }) {
  if (hidden || code == null) return <div className="pcard back" />
  const rank = RANKS[code % 13]
  const suit = SUITS[Math.floor(code / 13)]
  const red = suit === '♥' || suit === '♦'
  return (
    <div className={`pcard${red ? ' red' : ''}`}>
      <span className="pcard-r">{rank}</span>
      <span className="pcard-s">{suit}</span>
    </div>
  )
}

function StakePicker({ value, onChange, balance, disabled }) {
  return (
    <div className="chips">
      {CHIPS.map((c) => (
        <button
          key={c}
          className={`chip${value === c ? ' sel' : ''}`}
          disabled={disabled || c > balance}
          onClick={() => onChange(c)}
        >
          {money(c, { compact: true })}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
function Slots() {
  const { profile, refreshProfile } = useAuth()
  const balance = Number(profile?.balance ?? 0)
  const [stake, setStake] = useState(10)
  const [reels, setReels] = useState(['🍒', '🍋', '🔔'])
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')
  const animRef = useRef(null)

  async function spin() {
    if (spinning) return
    setErr('')
    if (stake > balance) { setErr('Not enough in the pot.'); return }
    setSpinning(true)
    setResult(null)
    const start = Date.now()
    animRef.current = setInterval(() => setReels([randSym(), randSym(), randSym()]), 80)
    const { data, error } = await supabase.rpc('play_slots', { p_stake: stake })
    await new Promise((r) => setTimeout(r, Math.max(0, 650 - (Date.now() - start))))
    clearInterval(animRef.current)
    setSpinning(false)
    if (error) { setErr(error.message); return }
    setReels(data.reels)
    setResult({ payout: Number(data.payout), mult: Number(data.multiplier) })
    refreshProfile()
  }

  return (
    <div className="card stack">
      {err && <div className="error-box">{err}</div>}
      <div className={`slot-reels${spinning ? ' spinning' : ''}`}>
        {reels.map((s, i) => (
          <div className="slot-reel" key={i}>{s}</div>
        ))}
      </div>

      <div className="slot-result">
        {result ? (
          result.payout > 0 ? (
            <span className="win">{result.mult}× — won {money(result.payout)}</span>
          ) : (
            <span className="faint">No win. Spin again.</span>
          )
        ) : (
          <span className="faint">Match three to win. 💎💎💎 pays 60×.</span>
        )}
      </div>

      <div>
        <div className="prob-label" style={{ marginBottom: 6 }}>Stake · {money(stake, { compact: true })}</div>
        <StakePicker value={stake} onChange={setStake} balance={balance} disabled={spinning} />
      </div>

      <button className="btn btn-primary" onClick={spin} disabled={spinning || stake > balance}>
        {spinning ? 'Spinning…' : `Spin ${money(stake, { compact: true })}`}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
function Blackjack() {
  const { profile, refreshProfile } = useAuth()
  const balance = Number(profile?.balance ?? 0)
  const [stake, setStake] = useState(10)
  const [hand, setHand] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const inPlay = hand && hand.status === 'player'

  async function call(fn, args) {
    setErr('')
    setBusy(true)
    const { data, error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) { setErr(error.message); return null }
    refreshProfile()
    return data
  }

  async function deal() {
    if (stake > balance) { setErr('Not enough in the pot.'); return }
    const d = await call('blackjack_deal', { p_stake: stake })
    if (d) setHand(d)
  }
  async function hit() {
    const d = await call('blackjack_hit', { p_hand: hand.hand_id })
    if (d) setHand((h) => ({ ...h, ...d }))
  }
  async function stand() {
    const d = await call('blackjack_stand', { p_hand: hand.hand_id })
    if (d) setHand((h) => ({ ...h, ...d }))
  }

  const resultText = {
    won: (h) => `You win ${money(h.payout)}`,
    lost: () => 'Dealer wins',
    push: () => 'Push — stake returned',
    blackjack: (h) => `Blackjack! ${money(h.payout)}`,
  }

  return (
    <div className="card stack">
      {err && <div className="error-box">{err}</div>}

      {!hand ? (
        <>
          <div className="bj-empty faint">Beat the dealer to 21. Blackjack pays 3:2.</div>
          <div>
            <div className="prob-label" style={{ marginBottom: 6 }}>Stake · {money(stake, { compact: true })}</div>
            <StakePicker value={stake} onChange={setStake} balance={balance} disabled={busy} />
          </div>
          <button className="btn btn-primary" onClick={deal} disabled={busy || stake > balance}>
            {busy ? '…' : `Deal ${money(stake, { compact: true })}`}
          </button>
        </>
      ) : (
        <>
          <div className="bj-area">
            <div className="bj-row-label">
              Dealer {hand.dealer_total != null && <span className="tnum">· {hand.dealer_total}</span>}
            </div>
            <div className="bj-cards">
              {inPlay ? (
                <>
                  <Card code={hand.dealer_up} />
                  <Card hidden />
                </>
              ) : (
                (hand.dealer ?? [hand.dealer_up]).map((c, i) => <Card key={i} code={c} />)
              )}
            </div>
          </div>

          <div className="bj-area">
            <div className="bj-row-label">You <span className="tnum">· {hand.player_total}</span></div>
            <div className="bj-cards">
              {hand.player.map((c, i) => <Card key={i} code={c} />)}
            </div>
          </div>

          {inPlay ? (
            <div className="chips">
              <button className="btn btn-yes" onClick={hit} disabled={busy}>Hit</button>
              <button className="btn btn-no" onClick={stand} disabled={busy}>Stand</button>
            </div>
          ) : (
            <>
              <div className={`bj-result ${hand.status === 'won' || hand.status === 'blackjack' ? 'win' : hand.status === 'push' ? 'push' : 'lose'}`}>
                {(resultText[hand.status] ?? (() => 'Dealer wins'))(hand)}
              </div>
              <button className="btn btn-primary" onClick={() => setHand(null)} disabled={busy}>
                Deal again
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
export default function Casino() {
  const [game, setGame] = useState('slots')
  return (
    <>
      <div className="section-head">
        <h2>Casino</h2>
        <div className="tabs">
          <button className={`tab${game === 'slots' ? ' active' : ''}`} onClick={() => setGame('slots')}>Slots</button>
          <button className={`tab${game === 'blackjack' ? ' active' : ''}`} onClick={() => setGame('blackjack')}>Blackjack</button>
        </div>
      </div>

      {game === 'slots' ? <Slots /> : <Blackjack />}

      <div className="spacer-lg" />
      <p className="faint center" style={{ fontSize: 12 }}>
        Play money · the house has an edge · casino losses don’t touch your market P/L
      </p>
    </>
  )
}
