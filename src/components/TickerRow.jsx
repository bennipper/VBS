import { useNavigate } from 'react-router-dom'
import Sparkline from './Sparkline.jsx'
import ChangePill from './ChangePill.jsx'
import { priceStr } from '../lib/exchange.js'

// One flat Apple-style row inside the Exchange card. Symbol + name left,
// sparkline centre, price + change pill right. Halted badge borrows the LIVE tag.
export default function TickerRow({ ticker, series, halted, onClick }) {
  const navigate = useNavigate()
  const go = onClick ?? (() => navigate(`/ticker/${ticker.id}`))
  const open = Number(ticker.session_open)
  const price = Number(ticker.price)

  return (
    <div className="tk-row" role="button" onClick={go}>
      <div className="tk-id">
        <div className="tk-sym">
          {ticker.symbol}
          {halted && <span className="tk-halted">HALTED</span>}
        </div>
        <div className="tk-name">{ticker.name}</div>
      </div>
      <div className="tk-spark">
        <Sparkline points={series} open={open} />
      </div>
      <div className="tk-right">
        <div className="tk-price tnum">{priceStr(price)}</div>
        <ChangePill from={open} to={price} />
      </div>
    </div>
  )
}
