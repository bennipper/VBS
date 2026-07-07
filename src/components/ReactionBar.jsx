import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { REACTION_EMOJIS } from '../config.js'

// WhatsApp-style reactions on a punt. `reactions` is the list of rows for this
// bet ([{ user_id, emoji }]). Long-press (or tap the ＋) opens the picker.
export default function ReactionBar({ betId, reactions, userId, onChange }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const pressTimer = useRef(null)
  const barRef = useRef(null)

  // Close the picker on any outside tap.
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (barRef.current && !barRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  // Aggregate into { emoji: { count, mine } }.
  const counts = {}
  for (const r of reactions) {
    const c = (counts[r.emoji] ??= { count: 0, mine: false })
    c.count += 1
    if (r.user_id === userId) c.mine = true
  }
  const pills = Object.entries(counts)

  async function toggle(emoji) {
    if (busy || !userId) return
    setBusy(true)
    const mine = counts[emoji]?.mine
    // Optimistic: parent re-derives from realtime, but update instantly too.
    onChange?.(emoji, !mine)
    if (mine) {
      await supabase.from('bet_reactions').delete().match({ bet_id: betId, user_id: userId, emoji })
    } else {
      await supabase.from('bet_reactions').insert({ bet_id: betId, user_id: userId, emoji })
    }
    setBusy(false)
    setOpen(false)
  }

  // Long-press handlers for the whole row (passed up via the ＋ button here).
  const startPress = () => {
    pressTimer.current = setTimeout(() => setOpen(true), 350)
  }
  const cancelPress = () => clearTimeout(pressTimer.current)

  return (
    <div className="reaction-bar" ref={barRef}>
      {pills.map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          className={`react-pill${mine ? ' mine' : ''}`}
          onClick={() => toggle(emoji)}
          disabled={busy}
        >
          <span>{emoji}</span>
          <span className="tnum">{count}</span>
        </button>
      ))}

      <button
        className="react-add"
        onClick={() => setOpen((o) => !o)}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        aria-label="React"
      >
        <span className="react-add-ico">☺</span>
        <span className="react-add-plus">+</span>
      </button>

      {open && (
        <div className="react-picker">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className={`react-choice${counts[emoji]?.mine ? ' mine' : ''}`}
              onClick={() => toggle(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
