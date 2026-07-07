// ---------------------------------------------------------------------------
// VBS — global config. Tweak these and the whole app follows.
// ---------------------------------------------------------------------------

export const APP_NAME = 'VBS'
export const APP_TAGLINE = 'The group chat bookmaker'

// Currency symbol is configurable per the brief. British bookie by default.
export const CURRENCY = '£'

// Economy knobs (kept in sync with the SQL — see supabase/schema.sql).
export const STARTING_BALANCE = 1000
export const BAILOUT_AMOUNT = 1000
export const BAILOUT_THRESHOLD = 50
export const SEED_LIQUIDITY = 300

// Quick-bet chips on the bet slip.
export const QUICK_CHIPS = [10, 50, 100]

// Avatar emoji options for the picker.
export const AVATAR_EMOJIS = [
  '🎲', '🎰', '🃏', '💸', '🍺', '🐎', '🦆', '🔥',
  '💀', '👑', '🤡', '🐍', '⚡', '🎯', '🧨', '🥴',
]

export const DEFAULT_AVATAR = '🎲'

// Reactions you can slap on a punt (WhatsApp-style).
export const REACTION_EMOJIS = ['👍', '😂', '😮', '😢', '💀', '🔥', '🐐', '🤡']

// Avatar upload limits.
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024 // 5 MB
export const AVATAR_BUCKET = 'avatars'
