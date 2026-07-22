// ---------------------------------------------------------------------------
// TightPunt — global config. Tweak these and the whole app follows.
// ---------------------------------------------------------------------------

export const APP_NAME = 'TightPunt'
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

// Bookie margin (vig) taken off every stake. Half goes to the market creator,
// half is burned as a money sink. Keep in sync with place_bet in schema.sql.
export const BET_VIG = 0.02

// Avatar emoji options for the picker.
export const AVATAR_EMOJIS = [
  '🎲', '🎰', '🃏', '💸', '🍺', '🐎', '🦆', '🔥',
  '💀', '👑', '🤡', '🐍', '⚡', '🎯', '🧨', '🥴',
]

export const DEFAULT_AVATAR = '🎲'

// Reactions you can slap on a punt (WhatsApp-style).
export const REACTION_EMOJIS = ['👍', '😂', '😮', '😢', '💀', '🔥', '🐐', '🤡']

// Market categories for filtering. Keep in sync with the check in schema.sql.
export const CATEGORIES = ['Work', 'Social', 'Sports', 'Food', 'Dares']
export const CATEGORY_EMOJI = {
  Work: '💼',
  Social: '🍻',
  Sports: '⚽',
  Food: '🍔',
  Dares: '😈',
}
export const DEFAULT_CATEGORY = 'Social'

// Sort orders for the feed.
export const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'volume', label: 'Most bet' },
  { key: 'odds_high', label: 'Highest odds' },
  { key: 'odds_low', label: 'Lowest odds' },
]

// Avatar upload limits.
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024 // 5 MB
export const AVATAR_BUCKET = 'avatars'

// Flag emoji for event teams (the event banner + event page). Falls back to 🏳️.
export const TEAM_FLAGS = {
  England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  Wales: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  Argentina: '🇦🇷',
  France: '🇫🇷',
  Brazil: '🇧🇷',
  Spain: '🇪🇸',
  Germany: '🇩🇪',
  Portugal: '🇵🇹',
  Netherlands: '🇳🇱',
  Italy: '🇮🇹',
  USA: '🇺🇸',
}

export function teamFlag(name) {
  return TEAM_FLAGS[name] || '🏳️'
}

// ---------------------------------------------------------------------------
// The Exchange — vote-driven tickers. Keep in sync with supabase/exchange.sql.
// ---------------------------------------------------------------------------
export const VOTE_BUDGET = 10          // vote units per user per room per day
export const MAX_MAGNITUDE = 6         // max units on a single vote
export const REASON_MIN_MAGNITUDE = 3  // reason required at/above this magnitude
export const REASON_MAX_CHARS = 140
export const HALT_DROP = 0.15          // circuit breaker: −15% from the 04:00 open
export const INDEX_LABEL = 'THE INDEX' // pinned mean-of-all-tickers row

export const TICKER_TYPES = [
  { key: 'member', label: 'Member', emoji: '🧑', hint: 'A mate in this room' },
  { key: 'person', label: 'Person', emoji: '🕵️', hint: 'Not a member — use a nickname, not a real name' },
  { key: 'thing', label: 'Thing', emoji: '📦', hint: 'The office fridge, the printer…' },
  { key: 'concept', label: 'Concept', emoji: '💭', hint: 'Monday, the weather, AI…' },
]

// Filter chips on the Exchange list.
export const TICKER_FILTERS = [
  { key: 'All', label: 'All', types: null },
  { key: 'People', label: 'People', types: ['member', 'person'] },
  { key: 'Things', label: 'Things', types: ['thing'] },
  { key: 'Concepts', label: 'Concepts', types: ['concept'] },
]

// Time ranges on charts. 1D reads live from ticker_events; the rest from daily_closes.
export const TIME_RANGES = ['1D', '1W', '1M', '3M', 'YTD', '1Y']

export const TICKER_EMOJIS = [
  '📈', '📉', '🧑', '🕵️', '📦', '💭', '🖨️', '🧊', '🔥', '💀',
  '👑', '🤡', '🐍', '⚡', '🎯', '🧨', '🥴', '🚽', '☕', '🌧️',
]
