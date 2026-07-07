import { useEffect, useRef, useState } from 'react'

// The one loud element. Huge tabular figure that flashes gold when it changes.
// size: 'sm' | 'lg' | 'xl'
export default function ProbNumber({ prob, size = 'lg', label }) {
  const clamped = Math.min(0.99, Math.max(0.01, Number(prob) || 0))
  const value = Math.round(clamped * 100)
  const prev = useRef(value)
  const [flash, setFlash] = useState(null)

  useEffect(() => {
    if (prev.current !== value) {
      setFlash(value > prev.current ? 'up' : 'dn')
      prev.current = value
      const t = setTimeout(() => setFlash(null), 620)
      return () => clearTimeout(t)
    }
  }, [value])

  const sizeClass = size === 'xl' ? 'prob-xl' : size === 'sm' ? 'prob-sm' : 'prob-lg'
  const flashClass = flash === 'up' ? ' tick-up' : flash === 'dn' ? ' tick-dn' : ''

  return (
    <div>
      <div className={`prob ${sizeClass}${flashClass}`}>
        <span className="tnum">{value}</span>
        <span className="pctsign">%</span>
      </div>
      {label && <div className="prob-label">{label}</div>}
    </div>
  )
}
