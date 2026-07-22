-- ============================================================================
-- The Exchange — a vote-driven stock market, one per room.
-- Companion to the prediction markets. Prices move by VOTES, not trades, but
-- the same money-safety rule applies: price only ever changes inside a
-- SECURITY DEFINER RPC that takes a FOR UPDATE lock. Everything is room-scoped
-- and members-only, reusing the V5 is_room_member(room) RLS helper.
--
-- NOTE: the spec calls the votes table `events`; the app already has an
-- `events` table (World Cup), so this uses `ticker_events`.
-- Apply on the live project, then mirror into schema.sql.
-- ============================================================================

-- ---- Tables ----------------------------------------------------------------
create table if not exists public.tickers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9]{2,5}$'),
  name text not null check (char_length(name) between 1 and 60),
  type text not null check (type in ('member','person','thing','concept')),
  emoji text not null default '📈',
  subject_user_id uuid references public.profiles on delete set null,
  created_by uuid not null references public.profiles on delete cascade,
  price numeric(12,2) not null default 100 check (price >= 1),
  session_open numeric(12,2) not null default 100,
  session_open_at timestamptz,
  halted_until timestamptz,
  created_at timestamptz not null default now(),
  unique (room_id, symbol)
);
create index if not exists tickers_room_idx on public.tickers (room_id, created_at desc);

create table if not exists public.ticker_events (
  id uuid primary key default gen_random_uuid(),
  ticker_id uuid not null references public.tickers on delete cascade,
  room_id uuid not null references public.rooms on delete cascade,
  user_id uuid references public.profiles on delete set null,
  kind text not null default 'vote' check (kind in ('vote','halt','listing')),
  direction text check (direction in ('UP','DOWN')),
  magnitude int check (magnitude between 1 and 6),
  reason text check (char_length(reason) <= 140),
  price_before numeric(12,2) not null,
  price_after numeric(12,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists ticker_events_ticker_idx on public.ticker_events (ticker_id, created_at);
create index if not exists ticker_events_budget_idx on public.ticker_events (room_id, user_id, created_at);

create table if not exists public.daily_closes (
  ticker_id uuid not null references public.tickers on delete cascade,
  room_id uuid not null references public.rooms on delete cascade,
  date date not null,
  open numeric(12,2) not null,
  close numeric(12,2) not null,
  high numeric(12,2) not null,
  low numeric(12,2) not null,
  volume int not null default 0,
  primary key (ticker_id, date)
);
create index if not exists daily_closes_room_date_idx on public.daily_closes (room_id, date);

-- ---- RLS: members-only read; all writes go through the RPCs / service role -
alter table public.tickers enable row level security;
alter table public.ticker_events enable row level security;
alter table public.daily_closes enable row level security;

drop policy if exists "read tickers" on public.tickers;
create policy "read tickers" on public.tickers for select using (public.is_room_member(room_id));
drop policy if exists "read ticker_events" on public.ticker_events;
create policy "read ticker_events" on public.ticker_events for select using (public.is_room_member(room_id));
drop policy if exists "read daily_closes" on public.daily_closes;
create policy "read daily_closes" on public.daily_closes for select using (public.is_room_member(room_id));

-- ---- Session boundary: most recent 04:00 Europe/London as a timestamptz ----
-- A night out settles as one trading day. Handles BST automatically.
create or replace function public.exchange_session_start()
returns timestamptz language sql stable set search_path = public as $$
  select case
    when (now() at time zone 'Europe/London')::time >= time '04:00'
      then (((now() at time zone 'Europe/London')::date) + time '04:00') at time zone 'Europe/London'
    else ((((now() at time zone 'Europe/London')::date) - 1) + time '04:00') at time zone 'Europe/London'
  end;
$$;

-- ---- RPC: create_ticker ----------------------------------------------------
create or replace function public.create_ticker(
  p_room_id uuid, p_symbol text, p_name text, p_type text,
  p_emoji text default null, p_subject_user_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_sym text := upper(trim(p_symbol));
  v_session timestamptz := public.exchange_session_start();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_user) then
    raise exception 'not a member of this room'; end if;
  if p_type not in ('member','person','thing','concept') then raise exception 'invalid ticker type'; end if;
  if v_sym !~ '^[A-Z0-9]{2,5}$' then raise exception 'symbol must be 2-5 letters or digits'; end if;
  if char_length(trim(p_name)) < 1 or char_length(trim(p_name)) > 60 then raise exception 'name must be 1-60 chars'; end if;
  if p_type = 'member' and p_subject_user_id is null then raise exception 'a member ticker needs a subject'; end if;
  if exists (select 1 from public.tickers where room_id = p_room_id and symbol = v_sym) then
    raise exception 'symbol % is already listed in this room', v_sym; end if;

  insert into public.tickers
    (room_id, symbol, name, type, emoji, subject_user_id, created_by, price, session_open, session_open_at)
  values
    (p_room_id, v_sym, trim(p_name), p_type, coalesce(nullif(trim(p_emoji), ''), '📈'),
     case when p_type = 'member' then p_subject_user_id else null end, v_user, 100, 100, v_session)
  returning id into v_id;

  insert into public.ticker_events (ticker_id, room_id, user_id, kind, price_before, price_after)
  values (v_id, p_room_id, v_user, 'listing', 100, 100);
  return v_id;
end;
$$;

-- ---- RPC: cast_vote (the core) --------------------------------------------
create or replace function public.cast_vote(
  p_ticker_id uuid, p_direction text, p_magnitude int, p_reason text default null
)
returns table (price_after numeric, remaining_budget int, halted boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_room uuid; v_type text; v_subject uuid;
  v_price numeric; v_open numeric; v_open_at timestamptz;
  v_session timestamptz := public.exchange_session_start();
  v_used int; v_factor numeric; v_new numeric; v_halt boolean := false;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_direction not in ('UP','DOWN') then raise exception 'direction must be UP or DOWN'; end if;
  if p_magnitude is null or p_magnitude < 1 or p_magnitude > 6 then
    raise exception 'magnitude must be between 1 and 6'; end if;

  select room_id, type, subject_user_id, price, session_open, session_open_at
    into v_room, v_type, v_subject, v_price, v_open, v_open_at
    from public.tickers where id = p_ticker_id for update;
  if v_room is null then raise exception 'ticker not found'; end if;
  if not exists (select 1 from public.room_members where room_id = v_room and user_id = v_user) then
    raise exception 'not a member of this room'; end if;
  if v_type = 'member' and v_subject = v_user then
    raise exception 'you cannot vote on your own ticker'; end if;
  if p_magnitude >= 3 and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'a reason is required for votes of 3 or more'; end if;
  if p_reason is not null and char_length(p_reason) > 140 then
    raise exception 'reason is too long (140 max)'; end if;

  -- New trading day → roll the open and clear any halt (lazy; the cron also does this).
  if v_open_at is null or v_open_at < v_session then
    v_open := v_price;
    update public.tickers set session_open = v_price, session_open_at = v_session, halted_until = null
      where id = p_ticker_id;
  end if;

  select coalesce(sum(magnitude), 0) into v_used
    from public.ticker_events
    where room_id = v_room and user_id = v_user and kind = 'vote' and created_at >= v_session;
  if v_used + p_magnitude > 10 then
    raise exception 'daily vote budget spent (% of 10 used today)', v_used; end if;

  if p_direction = 'DOWN' and v_price <= v_open * 0.85 then
    raise exception 'trading halted — no more DOWN votes until the next reset'; end if;

  v_factor := power(1.01, case when p_direction = 'UP' then p_magnitude else -p_magnitude end);
  v_new := greatest(1.00, round(v_price * v_factor, 2));

  insert into public.ticker_events
    (ticker_id, room_id, user_id, kind, direction, magnitude, reason, price_before, price_after)
  values
    (p_ticker_id, v_room, v_user, 'vote', p_direction, p_magnitude, nullif(trim(p_reason), ''), v_price, v_new);

  if p_direction = 'DOWN' and v_new <= v_open * 0.85 then
    v_halt := true;
    insert into public.ticker_events (ticker_id, room_id, user_id, kind, price_before, price_after)
    values (p_ticker_id, v_room, null, 'halt', v_new, v_new);
  end if;

  update public.tickers
    set price = v_new,
        halted_until = case when v_halt then (v_session + interval '1 day') else halted_until end
    where id = p_ticker_id;

  return query select v_new, (10 - (v_used + p_magnitude)), v_halt;
end;
$$;

-- ---- RPC: exchange_budget — my remaining vote units in a room today --------
create or replace function public.exchange_budget(p_room_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select 10 - coalesce((
    select sum(magnitude) from public.ticker_events
    where room_id = p_room_id and user_id = auth.uid() and kind = 'vote'
      and created_at >= public.exchange_session_start()
  ), 0);
$$;

-- ---- RPC: delist_ticker ----------------------------------------------------
create or replace function public.delist_ticker(p_ticker_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_created uuid; v_subject uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select created_by, subject_user_id into v_created, v_subject
    from public.tickers where id = p_ticker_id;
  if v_created is null then raise exception 'ticker not found'; end if;
  if v_user <> v_created and (v_subject is null or v_user <> v_subject) then
    raise exception 'only the lister or the subject can delist this ticker'; end if;
  delete from public.tickers where id = p_ticker_id;
end;
$$;

-- ---- Grants ----------------------------------------------------------------
revoke execute on function public.create_ticker(uuid, text, text, text, text, uuid) from public, anon;
revoke execute on function public.cast_vote(uuid, text, int, text) from public, anon;
revoke execute on function public.delist_ticker(uuid) from public, anon;
revoke execute on function public.exchange_budget(uuid) from public, anon;
grant execute on function public.create_ticker(uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.cast_vote(uuid, text, int, text) to authenticated;
grant execute on function public.delist_ticker(uuid) to authenticated;
grant execute on function public.exchange_budget(uuid) to authenticated;

-- ---- Prediction-market hook: ticker_threshold markets ----------------------
alter table public.markets add column if not exists market_type text not null default 'binary'
  check (market_type in ('binary','ticker_threshold'));
alter table public.markets add column if not exists ticker_id uuid references public.tickers on delete set null;
alter table public.markets add column if not exists threshold_operator text check (threshold_operator in ('above','below'));
alter table public.markets add column if not exists target_price numeric;
alter table public.markets add column if not exists resolve_at timestamptz;

-- market_summary exposes the ticker-market fields (drop + recreate).
drop view if exists public.market_summary;
create view public.market_summary with (security_invoker = true) as
select
  m.id, m.creator_id, m.room_id, m.event_id, m.template_id,
  m.market_type, m.ticker_id, m.threshold_operator, m.target_price, m.resolve_at,
  m.question, m.description, m.category, m.pool_yes, m.pool_no,
  m.closes_at, m.resolved_outcome, m.resolved_at, m.created_at,
  p.username as creator_username, p.avatar_emoji as creator_emoji, p.avatar_url as creator_avatar_url,
  coalesce(b.volume, 0) as volume, coalesce(b.bet_count, 0) as bet_count
from public.markets m
join public.profiles p on p.id = m.creator_id
left join (
  select market_id, sum(amount) as volume, count(*) as bet_count
  from public.bets group by market_id
) b on b.market_id = m.id;
grant select on public.market_summary to anon, authenticated;

-- ---- Realtime: live prices + vote feed -------------------------------------
do $$
declare t text;
begin
  foreach t in array array['tickers','ticker_events'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
