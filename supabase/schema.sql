-- ============================================================
-- Галактика Игр — схема синк-сервера (Supabase)
-- Выполни этот скрипт в SQL Editor своего проекта Supabase.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Игроки ----------
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  nickname text not null default 'Гость',
  code text,
  code_expires_at timestamptz,
  verified boolean not null default false,
  registered_at timestamptz not null default now(),
  device_id text not null default ''
);

-- ---------- Сессии ----------
create table if not exists public.sessions (
  id bigint generated always as identity primary key,
  player_email text,
  guest_id int,
  device_id text,
  player_type text not null default 'guest',
  nickname text not null,
  ts timestamptz not null default now(),
  date text,
  "time" text,
  game text not null,
  game_name text,
  duration_ms bigint not null default 0,
  result text
);

create index if not exists sessions_ts_idx on public.sessions (ts desc);
create index if not exists sessions_player_idx on public.sessions (player_email);
create index if not exists sessions_guest_idx on public.sessions (device_id);

-- ---------- RLS ----------
alter table public.players enable row level security;
alter table public.sessions enable row level security;

-- Аноним может только: вставить игрока и сессию.
-- Читать данные аноним НЕ может. Подтверждение кода — через
-- security definer функцию verify_player() ниже.
revoke all on public.players from anon;
revoke all on public.sessions from anon;
grant insert on public.players to anon;
grant insert on public.sessions to anon;

drop policy if exists players_anon_insert on public.players;
create policy players_anon_insert on public.players
  for insert to anon
  with check (email is not null and nickname is not null);

drop policy if exists players_anon_verify on public.players;

drop policy if exists sessions_anon_insert on public.sessions;
create policy sessions_anon_insert on public.sessions
  for insert to anon
  with check (true);

-- ---------- Верификация кода ----------
-- Проверяет код из таблицы игроков и помечает verified=true.
-- Выполняется от владельца (postgres), поэтому RLS не мешает,
-- но без верного кода ничего не поменяется.
create or replace function public.verify_player(p_email text, p_code text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_verified boolean;
begin
  select verified into v_verified
  from public.players
  where email = lower(btrim(p_email))
  limit 1;
  if v_verified is true then
    return true;
  end if;
  update public.players
     set verified = true, code = null
   where email = lower(btrim(p_email))
     and code = btrim(p_code)
     and (code_expires_at is null or code_expires_at > now());
  return found;
end;
$$;

grant execute on function public.verify_player(text, text) to anon;

-- ---------- Чтение для страницы мониторинга ----------
-- Функции запускаются от владельца (postgres), RLS обходится,
-- но почта/коды не отдаются — только подсказка почты.
create or replace function public.monitor_data()
returns table (
  player_type text,
  nickname text,
  player_email text,
  email_hint text,
  device_id text,
  registered_at timestamptz,
  verified boolean,
  total_time_ms bigint,
  wins bigint,
  session_count bigint
)
language sql security definer set search_path = public as $$
  select
    coalesce(s.player_type, 'guest')::text as player_type,
    coalesce(s.nickname, 'Гость')::text as nickname,
    coalesce(s.player_email, '')::text as player_email,
    case
      when s.player_email is not null and s.player_email <> '' then
        left(s.player_email, 2) || '***@' || split_part(s.player_email, '@', 2)
      else '' end::text as email_hint,
    coalesce(s.device_id, '')::text as device_id,
    min(p.registered_at) as registered_at,
    bool_or(coalesce(p.verified, false)) as verified,
    sum(coalesce(s.duration_ms, 0)) as total_time_ms,
    count(*) filter (
      where (s.result ~ 'побед|победа|выигр|заработал|очков' and s.result !~ 'пораж')
    ) as wins,
    count(*) as session_count
  from public.sessions s
  left join public.players p on p.email = s.player_email
  group by s.player_email, s.device_id, s.player_type, s.nickname
  order by min(p.registered_at) asc;
$$;

create or replace function public.monitor_sessions()
returns table (
  player_type text,
  nickname text,
  player_email text,
  device_id text,
  date text,
  "time" text,
  game text,
  game_name text,
  duration_ms bigint,
  result text,
  ts timestamptz
)
language sql security definer set search_path = public as $$
  select
    s.player_type::text,
    s.nickname::text,
    coalesce(s.player_email, '')::text,
    coalesce(s.device_id, '')::text,
    s.date,
    s."time",
    s.game,
    s.game_name,
    s.duration_ms,
    s.result,
    s.ts
  from public.sessions s
  order by s.ts desc
  limit 5000;
$$;

grant execute on function public.monitor_data() to anon;
grant execute on function public.monitor_sessions() to anon;
