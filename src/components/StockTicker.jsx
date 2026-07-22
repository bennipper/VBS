import { useNavigate } from 'react-router-dom'
import { priceStr, pctChange, signedPct } from '../lib/exchange.js'

// A scrolling ticker-tape of every stock's price + change, like the board on a
// finance channel. Reuses the activity-ticker marquee; taps jump to the ticker.
export default function StockTicker({ tickers }) {
  const navigate = useNavigate()
  if (!tickers || tickers.length === 0) return null

  // Duplicate so the marquee loops seamlessly.
  const loop = [...tickers, ...tickers]

  return (
    <div className="ticker" aria-label="Ticker tape">
      <div className="ticker-label">TAPE</div>
      <div className="ticker-viewport">
        <div className="ticker-track">
          {loop.map((t, i) => {
            const open = Number(t.session_open)
            const price = Number(t.price)
            const p = pctChange(open, price)
            const cls = p > 0 ? 'up' : p < 0 ? 'down' : 'faint'
            const arrow = p > 0 ? '▲' : p < 0 ? '▼' : '·'
            return (
              <button
                key={`${t.id}-${i}`}
                className="ticker-item tape-item"
                onClick={() => navigate(`/ticker/${t.id}`)}
              >
                <b>{t.symbol}</b> <span className="tnum">{priceStr(price)}</span>{' '}
                <span className={`tnum ${cls}`}>{arrow} {signedPct(open, price)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
