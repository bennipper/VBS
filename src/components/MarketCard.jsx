import { useNavigate } from 'react-router-dom'
import ProbNumber from './ProbNumber.jsx'
import Avatar from './Avatar.jsx'
import { probYes, previewBet } from '../lib/cpmm.js'
import { money, priceLabel, timeLeft } from '../lib/format.js'

// Current marginal price of a £1-ish bet on each side ≈ the instantaneous price.
function sidePrices(poolYes, poolNo) {
  const p = probYes(poolYes, poolNo)
  return { yes: p, no: 1 - p }
}

export default function MarketCard({ m }) {
  const navigate = useNavigate()
  const prob = probYes(Number(m.pool_yes), Number(m.pool_no))
  const { yes, no } = sidePrices(Number(m.pool_yes), Number(m.pool_no))
  const tl = timeLeft(m.closes_at)

  const go = (side) =>
    navigate(`/market/${m.id}`, { state: side ? { side } : undefined })

  return (
    <div className="card market-card" onClick={() => go()} role="button">
      <div className="q">{m.question}</div>
      <div className="meta">
        <span><Avatar url={m.creator_avatar_url} emoji={m.creator_emoji} size={15} /> {m.creator_username}</span>
        <span className="dot">{money(m.volume, { compact: true })} vol</span>
        <span className="dot">{m.bet_count} punt{Number(m.bet_count) === 1 ? '' : 's'}</span>
        {tl && <span className="dot">{tl === 'closed' ? 'betting closed' : `closes ${tl}`}</span>}
      </div>

      <div className="card-body">
        <ProbNumber prob={prob} size="lg" label="YES" />
        <div className="quickbet" onClick={(e) => e.stopPropagation()}>
          <button className="qb qb-yes" onClick={() => go('YES')}>
            <span className="side">YES</span>
            <span className="price tnum">{priceLabel(yes)}</span>
          </button>
          <button className="qb qb-no" onClick={() => go('NO')}>
            <span className="side">NO</span>
            <span className="price tnum">{priceLabel(no)}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
