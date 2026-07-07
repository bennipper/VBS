-- ============================================================================
-- VBS — full Supabase schema.
-- Run this once in the Supabase SQL editor (or via the CLI) on a fresh project.
-- It is idempotent enough to re-run during development.
--
-- Money NEVER moves in client code. Every balance change happens inside a
-- SECURITY DEFINER function with FOR UPDATE row locks. RLS lets everyone READ
-- everything (friends app, transparency is the fun) but blocks direct writes to
-- balances / bets / pools — those only change via the RPCs at the bottom.
-- ============================================================================

-- Economy knobs. Keep in sync with src/config.js.
--   STARTING_BALANCE = 1000
--   BAILOUT_AMOUNT   = 1000
--   BAILOUT_THRESHOLD= 50
--   SEED_LIQUIDITY   = 300   (client passes seed pools in; house absorbs variance)

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (char_length(username) between 3 and 20),
  avatar_emoji text not null default '🎲',
  balance numeric not null default 1000 check (balance >= 0),
  bailout_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.markets (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles on delete cascade,
  question text not null check (char_length(question) between 3 and 200),
  description text,
  pool_yes numeric not null check (pool_yes > 0),
  pool_no numeric not null check (pool_no > 0),
  closes_at timestamptz,
  resolved_outcome text check (resolved_outcome in ('YES', 'NO', 'VOID')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  side text not null check (side in ('YES', 'NO')),
  amount numeric not null check (amount > 0),
  shares numeric not null,
  price_avg numeric not null,
  prob_after numeric not null,
  payout numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  type text not null check (type in ('bet', 'payout', 'refund', 'bailout', 'signup_bonus')),
  amount numeric not null,
  market_id uuid references public.markets on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists bets_market_idx on public.bets (market_id, created_at);
create index if not exists bets_user_idx on public.bets (user_id, created_at desc);
create index if not exists markets_open_idx on public.markets (resolved_at, created_at desc);
create index if not exists tx_user_idx on public.transactions (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Signup trigger: new auth user -> profile with £1,000 + a signup_bonus tx.
-- Username + emoji come from the signup metadata the client sends.
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
  emoji text;
begin
  uname := coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''),
                    'punter_' || substr(new.id::text, 1, 6));
  emoji := coalesce(nullif(new.raw_user_meta_data->>'avatar_emoji', ''), '🎲');

  insert into public.profiles (id, username, avatar_emoji, balance)
  values (new.id, uname, emoji, 1000);

  insert into public.transactions (user_id, type, amount)
  values (new.id, 'signup_bonus', 1000);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- Everyone can READ everything. Nobody can write directly — the RPCs (which run
-- as SECURITY DEFINER and bypass RLS) are the only path that moves money.
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.markets enable row level security;
alter table public.bets enable row level security;
alter table public.transactions enable row level security;

-- Read policies (public within the friends app).
drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles for select using (true);

drop policy if exists "read markets" on public.markets;
create policy "read markets" on public.markets for select using (true);

drop policy if exists "read bets" on public.bets;
create policy "read bets" on public.bets for select using (true);

drop policy if exists "read transactions" on public.transactions;
create policy "read transactions" on public.transactions for select using (true);

-- Users may update their OWN cosmetic profile fields (username/emoji) directly.
-- balance / bailout_count are protected by a trigger below.
drop policy if exists "update own profile cosmetics" on public.profiles;
create policy "update own profile cosmetics" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Creating a market is allowed directly (the money side — seeding pools — is
-- house money, not the user's balance). Enforce you can only create as yourself.
drop policy if exists "create own markets" on public.markets;
create policy "create own markets" on public.markets
  for insert with check (auth.uid() = creator_id);

-- No direct INSERT/UPDATE/DELETE policies on bets or transactions => blocked.
-- No direct INSERT on profiles => only the signup trigger creates them.

-- Guard: block balance / bailout_count tampering via the cosmetic update policy.
-- The API talks to Postgres as the 'authenticated'/'anon' role, so a direct table
-- write runs with current_user = 'authenticated'. Our RPCs are SECURITY DEFINER
-- owned by 'postgres', so inside them current_user = the owner and this guard
-- steps aside — letting place_bet / resolve_market / claim_bailout do their job.
create or replace function public.guard_profile_money()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.balance is distinct from old.balance
      or new.bailout_count is distinct from old.bailout_count)
     and current_user in ('authenticated', 'anon') then
    raise exception 'balance and bailout_count can only change via RPCs';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_money_trg on public.profiles;
create trigger guard_profile_money_trg
  before update on public.profiles
  for each row execute function public.guard_profile_money();

-- ----------------------------------------------------------------------------
-- RPC: place_bet
-- Locks the user row + market row, checks balance and that the market is open,
-- runs the CPMM math, deducts balance, inserts the bet + a 'bet' transaction,
-- updates the pools. Returns shares, avg price and the new probability.
-- ----------------------------------------------------------------------------

create or replace function public.place_bet(
  p_market_id uuid,
  p_side text,
  p_amount numeric
)
returns table (shares numeric, price_avg numeric, prob_after numeric, new_balance numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_bal numeric;
  y numeric;
  n numeric;
  k numeric;
  m numeric := p_amount;
  y_prime numeric;
  n_prime numeric;
  s numeric;
  new_yes numeric;
  new_no numeric;
  v_prob numeric;
  v_price numeric;
  m_closes timestamptz;
  m_resolved timestamptz;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_side not in ('YES', 'NO') then
    raise exception 'side must be YES or NO';
  end if;
  if m is null or m <= 0 then
    raise exception 'amount must be positive';
  end if;

  -- Lock the punter's row, then the market row. Consistent order avoids deadlocks.
  select balance into v_bal from public.profiles where id = v_user for update;
  if v_bal is null then
    raise exception 'profile not found';
  end if;
  if v_bal < m then
    raise exception 'insufficient balance';
  end if;

  select pool_yes, pool_no, closes_at, resolved_at
    into y, n, m_closes, m_resolved
    from public.markets where id = p_market_id for update;
  if y is null then
    raise exception 'market not found';
  end if;
  if m_resolved is not null then
    raise exception 'market already resolved';
  end if;
  if m_closes is not null and m_closes <= now() then
    raise exception 'market is closed for betting';
  end if;

  -- CPMM: add m to both pools, mint shares on the chosen side.
  k := y * n;
  y_prime := y + m;
  n_prime := n + m;

  if p_side = 'YES' then
    s := y_prime - k / n_prime;
    new_yes := y_prime - s;
    new_no := n_prime;
  else
    s := n_prime - k / y_prime;
    new_no := n_prime - s;
    new_yes := y_prime;
  end if;

  v_price := m / s;
  v_prob := new_no / (new_yes + new_no); -- YES probability

  -- Move the money and record it all.
  update public.profiles set balance = balance - m where id = v_user;
  update public.markets set pool_yes = new_yes, pool_no = new_no where id = p_market_id;

  insert into public.bets (market_id, user_id, side, amount, shares, price_avg, prob_after)
  values (p_market_id, v_user, p_side, m, s, v_price, v_prob);

  insert into public.transactions (user_id, type, amount, market_id)
  values (v_user, 'bet', -m, p_market_id);

  return query select s, v_price, v_prob, (v_bal - m);
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: resolve_market
-- Creator only, open markets only. Credits winners (YES/NO) or refunds staked
-- amounts (VOID), stamps resolved_at/outcome, writes each bet's payout and a
-- payout/refund transaction per winner.
-- ----------------------------------------------------------------------------

create or replace function public.resolve_market(
  p_market_id uuid,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_creator uuid;
  v_resolved timestamptz;
  r record;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_outcome not in ('YES', 'NO', 'VOID') then
    raise exception 'outcome must be YES, NO or VOID';
  end if;

  select creator_id, resolved_at into v_creator, v_resolved
    from public.markets where id = p_market_id for update;
  if v_creator is null then
    raise exception 'market not found';
  end if;
  if v_creator <> v_user then
    raise exception 'only the creator can resolve this market';
  end if;
  if v_resolved is not null then
    raise exception 'market already resolved';
  end if;

  if p_outcome = 'VOID' then
    -- Refund every bettor their staked amount; payout = amount.
    for r in select id, user_id, amount from public.bets where market_id = p_market_id loop
      update public.profiles set balance = balance + r.amount where id = r.user_id;
      update public.bets set payout = r.amount where id = r.id;
      insert into public.transactions (user_id, type, amount, market_id)
      values (r.user_id, 'refund', r.amount, p_market_id);
    end loop;
  else
    -- Winning side's shares each pay £1. Losing side gets 0.
    for r in select id, user_id, side, shares from public.bets where market_id = p_market_id loop
      if r.side = p_outcome then
        update public.profiles set balance = balance + r.shares where id = r.user_id;
        update public.bets set payout = r.shares where id = r.id;
        insert into public.transactions (user_id, type, amount, market_id)
        values (r.user_id, 'payout', r.shares, p_market_id);
      else
        update public.bets set payout = 0 where id = r.id;
      end if;
    end loop;
  end if;

  update public.markets
    set resolved_outcome = p_outcome, resolved_at = now()
    where id = p_market_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: claim_bailout
-- Only if balance < £50. Credits £1,000, bumps bailout_count, logs a tx.
-- The bailout counter is public on profiles. Shame is the balancing mechanic.
-- ----------------------------------------------------------------------------

create or replace function public.claim_bailout()
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_bal numeric;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select balance into v_bal from public.profiles where id = v_user for update;
  if v_bal is null then
    raise exception 'profile not found';
  end if;
  if v_bal >= 50 then
    raise exception 'bailout only available when balance is below £50';
  end if;

  update public.profiles
    set balance = balance + 1000, bailout_count = bailout_count + 1
    where id = v_user;

  insert into public.transactions (user_id, type, amount)
  values (v_user, 'bailout', 1000);

  return v_bal + 1000;
end;
$$;

-- ----------------------------------------------------------------------------
-- Convenience view: markets + creator + volume/bet count for the feed.
-- Underlying tables are public-read, so exposing this is fine.
-- ----------------------------------------------------------------------------

create or replace view public.market_summary
with (security_invoker = true) as
select
  m.id,
  m.creator_id,
  m.question,
  m.description,
  m.pool_yes,
  m.pool_no,
  m.closes_at,
  m.resolved_outcome,
  m.resolved_at,
  m.created_at,
  p.username as creator_username,
  p.avatar_emoji as creator_emoji,
  coalesce(b.volume, 0) as volume,
  coalesce(b.bet_count, 0) as bet_count
from public.markets m
join public.profiles p on p.id = m.creator_id
left join (
  select market_id, sum(amount) as volume, count(*) as bet_count
  from public.bets
  group by market_id
) b on b.market_id = m.id;

grant select on public.market_summary to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Grants + realtime.
-- ----------------------------------------------------------------------------

-- Nothing callable by anon; trigger functions are not RPC-exposed; only the
-- three user RPCs are reachable, and only by signed-in users. Supabase grants
-- EXECUTE to anon/authenticated by default, so revoke from those roles by name.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_profile_money() from public, anon, authenticated;
revoke execute on function public.place_bet(uuid, text, numeric) from public, anon;
revoke execute on function public.resolve_market(uuid, text) from public, anon;
revoke execute on function public.claim_bailout() from public, anon;

grant execute on function public.place_bet(uuid, text, numeric) to authenticated;
grant execute on function public.resolve_market(uuid, text) to authenticated;
grant execute on function public.claim_bailout() to authenticated;

-- Live odds / balance updates. Idempotent — skips tables already published.
do $$
declare
  t text;
begin
  foreach t in array array['markets', 'bets', 'profiles'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- Concurrency smoke test (run manually in the SQL editor with two sessions, or
-- eyeball the logic): two place_bet calls on the same market race for the
-- market row lock, so pools update serially and k stays consistent. A punter
-- can't double-spend because their profile row is locked before the balance
-- check. See the FOR UPDATE clauses above.
-- ============================================================================


-- ============================================================================
-- V2 · Phase 1 — custom avatars, bet reactions, activity feed.
-- (Applied to the live DB as migration vbs_v2_phase1_reactions_avatars_activity.)
-- ============================================================================

-- ---- Custom profile pictures ----------------------------------------------
-- avatar_url is cosmetic; the "update own profile cosmetics" policy + money
-- guard already let the owner set it while blocking balance edits.
alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars read" on storage.objects;
create policy "avatars read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars insert own" on storage.objects;
create policy "avatars insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars update own" on storage.objects;
create policy "avatars update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---- Reactions on bets (WhatsApp-style) -----------------------------------
create table if not exists public.bet_reactions (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references public.bets on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (bet_id, user_id, emoji)
);
create index if not exists bet_reactions_bet_idx on public.bet_reactions (bet_id);

alter table public.bet_reactions enable row level security;

drop policy if exists "read reactions" on public.bet_reactions;
create policy "read reactions" on public.bet_reactions for select using (true);

-- Reactions move no money, so direct writes of your OWN reaction are allowed.
drop policy if exists "add own reaction" on public.bet_reactions;
create policy "add own reaction" on public.bet_reactions
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "remove own reaction" on public.bet_reactions;
create policy "remove own reaction" on public.bet_reactions
  for delete to authenticated using (auth.uid() = user_id);

-- ---- Feed view gains the creator's avatar_url -----------------------------
drop view if exists public.market_summary;
create view public.market_summary
with (security_invoker = true) as
select
  m.id, m.creator_id, m.question, m.description, m.pool_yes, m.pool_no,
  m.closes_at, m.resolved_outcome, m.resolved_at, m.created_at,
  p.username as creator_username,
  p.avatar_emoji as creator_emoji,
  p.avatar_url as creator_avatar_url,
  coalesce(b.volume, 0) as volume,
  coalesce(b.bet_count, 0) as bet_count
from public.markets m
join public.profiles p on p.id = m.creator_id
left join (
  select market_id, sum(amount) as volume, count(*) as bet_count
  from public.bets group by market_id
) b on b.market_id = m.id;

grant select on public.market_summary to anon, authenticated;

-- ---- Activity feed: punts + results + bailouts ----------------------------
drop view if exists public.activity_feed;
create view public.activity_feed
with (security_invoker = true) as
select
  b.id, 'punt'::text as kind, b.created_at,
  b.user_id as actor_id, pr.username as actor_username,
  pr.avatar_emoji as actor_emoji, pr.avatar_url as actor_avatar_url,
  b.market_id, m.question, b.side, b.amount, b.price_avg, null::text as outcome
from public.bets b
join public.profiles pr on pr.id = b.user_id
join public.markets m on m.id = b.market_id
union all
select
  m.id, 'result'::text, m.resolved_at, m.creator_id,
  pr.username, pr.avatar_emoji, pr.avatar_url,
  m.id, m.question, null::text, null::numeric, null::numeric, m.resolved_outcome
from public.markets m
join public.profiles pr on pr.id = m.creator_id
where m.resolved_at is not null
union all
select
  t.id, 'bailout'::text, t.created_at, t.user_id,
  pr.username, pr.avatar_emoji, pr.avatar_url,
  null::uuid, null::text, null::text, t.amount, null::numeric, null::text
from public.transactions t
join public.profiles pr on pr.id = t.user_id
where t.type = 'bailout';

grant select on public.activity_feed to anon, authenticated;

-- Realtime for reactions (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bet_reactions'
  ) then
    execute 'alter publication supabase_realtime add table public.bet_reactions';
  end if;
end $$;
