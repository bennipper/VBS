# VBS — the group chat bookmaker

A play-money prediction market for ~10 mates. Create silly markets ("Will Dave
burp before 9pm?"), bet fake money on YES/NO, and watch the odds move live as
money flows. Every user has a balance, stats, and a bailout button. Shame is the
balancing mechanic.

Built with **Vite + React** on the front and **Supabase** (Auth + Postgres +
RLS + Realtime) on the back. There is no server of our own — every money
movement is a `SECURITY DEFINER` Postgres function with row locks.

## How the odds work (CPMM)

No order book (there's no liquidity with 10 friends). Instead each market is an
**Automated Market Maker** with two virtual share pools, `pool_yes` and
`pool_no`, exactly like Manifold Markets:

- YES probability = `pool_no / (pool_yes + pool_no)`.
- Betting YES adds money to both pools and mints YES shares, pushing YES up.
- Each winning share pays `£1` on resolution. Early bettors on the right side
  get a better price.
- The house seeds liquidity (`SEED_LIQUIDITY = 300`) and absorbs the variance.

The client shows a **live preview** (shares / avg price / payout / new odds)
using `src/lib/cpmm.js`, but the authoritative math runs inside the `place_bet`
SQL function — the client numbers never move money.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL editor** and run the entire contents of
   [`supabase/schema.sql`](supabase/schema.sql). This creates the tables, RLS
   policies, the signup trigger, the three RPCs (`place_bet`, `resolve_market`,
   `claim_bailout`), the feed view, and enables Realtime.
3. (Optional) In **Authentication → Providers → Email**, turn off "Confirm
   email" for a 30-second drunk-on-your-phone signup.

### 2. Frontend

```bash
npm install
cp .env.local.example .env.local   # then fill in your project URL + anon key
npm run dev
```

Env vars come from **Project Settings → API**:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### 3. Deploy (Vercel)

Import the repo, set the same two env vars in the Vercel dashboard, deploy.
`vercel.json` handles SPA routing.

## Config

All economy knobs live at the top of [`src/config.js`](src/config.js):
`STARTING_BALANCE`, `BAILOUT_AMOUNT`, `BAILOUT_THRESHOLD`, `SEED_LIQUIDITY`, the
currency symbol (`£` by default), and the app name (**VBS**). Keep them in sync
with the comments in `schema.sql`.

## Security model

- RLS lets everyone **read** everything (friends app — transparency is the fun).
- Direct writes to `profiles.balance`, `bets`, and `markets.pool_*` are denied.
- Money only moves via the three RPCs, which take `FOR UPDATE` row locks so two
  mates hammering the bet button can't corrupt state or overspend.

## Screens

Auth · Markets feed · Market detail (chart + bet slip + resolve) · Create market
· Profile/stats (+ bailout) · Leaderboard. Mobile-first — built for one thumb in
the pub.

## Stretch (not built)

Sell shares early, multi-outcome markets, push notifications, trash-talk
comments. See the build brief.
