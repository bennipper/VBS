# TightPunt 🎲

**The group chat bookmaker.** A play-money prediction market for a group of
friends — create silly binary markets ("Will Dave burp before 9pm?"), punt fake
money on YES/NO, watch the odds move live as money flows, and settle your own
bets. Every punter has a balance, stats, badges, and a bailout button. Shame is
the balancing mechanic.

Live on Vercel · backend on Supabase · built with Vite + React.

> Formerly known as **VBS** (the repo keeps the old name; only the brand
> changed).

---

## Feature tour

### 📋 Markets (the core)
- Anyone opens a market in seconds: question, optional resolution criteria,
  category (Work / Social / Sports / Food / Dares), optional close time, and a
  starting-odds slider.
- **Live odds** — probabilities tick in realtime as mates punt, via Supabase
  Realtime. The one loud UI element is the huge probability number.
- **Bet slip** with quick chips (£10/£50/£100/ALL IN) and a live preview of
  shares, average price, the 2% margin, potential payout, and the new odds —
  before you confirm.
- **Cash out early** — sell your position back to the pool at the current
  price (CPMM sell = the buy math inverted). Resolution never double-pays
  sold shares (`bets.shares_open` tracks what's still open).
- **Creator rake** — a 2% margin comes off every stake: half goes to the
  market's creator, half is burned as a money sink.
- Market creators resolve their own markets: YES / NO / VOID (refund).
- Polymarket-style **category filter chips** + sort (newest / oldest / most
  bet / highest / lowest odds).

### 🚪 Rooms (private groups)
Betting happens in **rooms** — invite-only groups with their own economy:

- Anyone can **make a room** (they become the host) and invite mates via a
  **copy-able invite link** or a **shareable 8-digit code** typed into the
  app.
- **Per-room everything**: you get a fresh £1,000 in every room you join, and
  balances, bailouts, P/L, and the leaderboard are scoped to that room.
- **Members-only visibility** — markets, bets, and reactions in a room are
  invisible to non-members, enforced by row-level security.
- The Rooms page lists all your rooms; tapping one switches your whole
  dashboard to it. `/join/<code>` deep links survive signup.
- Hosts can also resolve abandoned markets in their room.

### 💬 Social layer
- **Emoji reactions on punts** (WhatsApp-style long-press picker), live via
  Realtime.
- **Custom profile pictures** (Supabase Storage, per-user RLS) with emoji
  fallback.
- **Live activity ticker** on the home feed: punts, results, cash-outs,
  bailouts.

### 🏆 Stats & shame
- **Leaderboard ranked by net P/L** (not balance — balance is inflated by
  bailouts), with an all-time / monthly "form" toggle, **Punter of the Month**
  banner, and a bailout column of shame.
- **Profiles**: balance, net P/L from the full transaction ledger, win rate,
  record win, full bet history, and **badges** (Nostradamus, Whale, Mug,
  Skint, …).
- **Bailout button** — balance under £50? Claim £1,000. It goes on your
  permanent record.

---

## How the odds work (CPMM)

No order book — with ~10 friends there's no counterparty liquidity. Each
market is an **automated market maker** (the Manifold Markets approach) with
two virtual share pools, `pool_yes` and `pool_no`:

- YES probability = `pool_no / (pool_yes + pool_no)`.
- Betting YES adds your (post-margin) stake to both pools and mints YES shares
  from the constant-product invariant `k = y·n`, pushing the price up.
- Each winning share pays **£1** at resolution; early bettors on the right
  side get better prices.
- Selling inverts the same math: shares go back into the pool, money comes
  out, `k` stays constant.
- The house seeds each market's liquidity (`SEED_LIQUIDITY = 300`); an
  asymmetric seed sets a custom starting probability.

The client mirrors this math for **instant previews**
([`src/lib/cpmm.js`](src/lib/cpmm.js)), but the authoritative math runs inside
Postgres — client numbers never move money.

## The money-safety rule

**Money never moves in client code.** Every balance change happens inside a
`SECURITY DEFINER` Postgres function that takes `FOR UPDATE` row locks, so two
mates hammering buttons simultaneously can't corrupt state or overspend:

| RPC | What it does |
|---|---|
| `place_bet(market, side, amount)` | balance check → CPMM math → 2% margin (half to creator, half burned) → pools + bet + ledger |
| `sell_position(market, side, shares)` | cash out open shares at the current price, retire them FIFO |
| `resolve_market(market, outcome)` | creator-only; pays £1 × open shares to winners (VOID refunds unsold stake) |
| `claim_bailout(room)` | only below £50; +£1,000 in that room and +1 to your shame counter |
| `create_room(name)` / `join_room(code)` | unique 8-digit invite code; joiners start with £1,000 |

RLS: everyone can **read** everything (transparency is the fun); direct writes
to balances, bets, pools, and picks are denied. A guard trigger blocks balance
tampering through the profile-cosmetics update path. Every movement lands in a
`transactions` ledger (`bet`, `payout`, `refund`, `cashout`, `rake`,
`bailout`, `signup_bonus`, `daily_stake`, `daily_win`), which is what P/L,
the leaderboard, and badges are computed from.

**Economy design:** bailouts are the faucet; the burned half of the rake and
The Daily's unclaimed pots are the sinks. P/L excludes bailouts/signup bonus
so the leaderboard stays about skill.

## Stack

- **Frontend** — Vite + React SPA (no server of our own). Deployed on Vercel;
  `vercel.json` handles SPA rewrites.
- **Backend** — Supabase: email/password Auth, Postgres with RLS, RPCs for all
  money movement, Realtime for live odds/reactions/balances, Storage for
  avatars.
- **Design** — dark cool-near-black theme, brand pink `#F56AAF`, figures and
  question titles in **Space Grotesk** (tabular numerals), UI text in the
  system sans stack. Icons are inline SVGs tinted via `currentColor`.

```
src/
  config.js            all knobs: name, currency, balances, vig, categories…
  lib/cpmm.js          client-side CPMM preview math (buy + sell)
  lib/format.js        money/percent/time formatting
  lib/achievements.js  badge rules
  context/AuthContext  session + live profile
  components/          Layout, MarketCard, BetSlip, ProbNumber, ProbChart,
                       ReactionBar, ActivityTicker, Avatar, Icon…
  pages/               Feed, MarketDetail, CreateMarket, Daily, Leaderboard,
                       Profile, Auth
supabase/schema.sql    the full database: tables, RLS, triggers, RPCs
public/                logo, app icon
```

## Setup

### 1 · Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Run the whole of [`supabase/schema.sql`](supabase/schema.sql) in the SQL
   editor. (On the live project this was applied as incremental migrations;
   the file recreates the same end state on a fresh project.)
3. Optional: Authentication → Providers → Email → turn off "Confirm email"
   for 30-second drunk-on-a-phone signups.

### 2 · Frontend
```bash
npm install
cp .env.local.example .env.local   # fill in from Project Settings → API
npm run dev
```
```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### 3 · Deploy
Import the repo on [Vercel](https://vercel.com), set the same two env vars,
deploy. Then add the deployed URL to Supabase **Auth → URL Configuration**.

## Config knobs

All in [`src/config.js`](src/config.js) (keep in sync with the constants noted
in `schema.sql`): `STARTING_BALANCE` (1000), `BAILOUT_AMOUNT` (1000),
`BAILOUT_THRESHOLD` (50), `SEED_LIQUIDITY` (300), `BET_VIG` (0.02), currency
symbol (£), categories, reaction emojis, quick chips.

## Project history

| Version | What shipped |
|---|---|
| **V1** | Markets, CPMM betting, resolution, bailouts, leaderboard, profiles, realtime |
| **V2 · Phase 1** | Emoji reactions, custom avatars, live activity ticker |
| **V2 · Phase 2** | Cash-out (sell positions), 2% creator rake + burn, ledger-based P/L, badges, monthly form table + Punter of the Month |
| **Redesign** | TightPunt rebrand (logo + name), pink `#F56AAF` system, cool near-black palette from Figma, Space Grotesk, category filters + sort, icons-only nav |
| **V3** | Casino (slots + blackjack, server-side RNG) — *killed: solo play vs the house had no social loop* |
| **V4** | **The Daily** replaces the casino: shared auto-resolving daily question, pot splitting, streaks — *later removed in V5* |
| **V5** | **Rooms**: private multi-tenancy — invite links + 8-digit codes, per-room balances/leaderboards, members-only RLS; existing game migrated into "The OG Room" |

## Roadmap

- 🔔 Push notifications (resolutions, The Daily, challenges)
- 🗳️ Multi-outcome markets ("Who pukes first?")
- Parked ideas: head-to-head challenges, WhatsApp weekly digest image,
  seasons + trophy cabinet

---

*Play money only. The house always wins, but the house isn't real.*
