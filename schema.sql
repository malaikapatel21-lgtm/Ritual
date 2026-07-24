-- ============================================================
-- RITUAL — CORE SCHEMA
-- Run this first in Supabase (SQL editor or migration).
-- Creates every table the app touches: profiles, venues, rituals,
-- signups, pods, attendance, streaks, messages.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- profiles — one row per authenticated user
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  city text not null,
  vibe_tags text[] not null default '{}',
  push_token text,
  created_at timestamptz not null default now()
);

-- Safe to re-run against a project that already has profiles from before
-- push_token existed.
alter table public.profiles add column if not exists push_token text;

-- ------------------------------------------------------------
-- venues — real-world locations rituals are anchored to
-- ------------------------------------------------------------
create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text not null,
  neighborhood text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- rituals — a recurring weekly slot at a venue (walk, sauna, run
-- club, yoga, ...). day_of_week: 0 = Sunday .. 6 = Saturday.
-- ------------------------------------------------------------
create table if not exists public.rituals (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  ritual_type text not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  min_pod_size smallint not null default 4,
  max_pod_size smallint not null default 8,
  -- Printed as a QR code (or handed out as a short code) at the venue.
  -- Scanning/entering it proves you're physically there before check-in
  -- is allowed — not cryptographic security, just a step up from a bare
  -- "I was there" tap.
  check_in_code text not null default upper(substr(md5(random()::text), 1, 6)),
  created_at timestamptz not null default now()
);

create index if not exists rituals_venue_id_idx on public.rituals (venue_id);

-- Safe to re-run against a project that already has rituals from before
-- check_in_code existed.
alter table public.rituals add column if not exists check_in_code text;
update public.rituals set check_in_code = upper(substr(md5(random()::text || id::text), 1, 6))
  where check_in_code is null;
alter table public.rituals alter column check_in_code set default upper(substr(md5(random()::text), 1, 6));
alter table public.rituals alter column check_in_code set not null;
create unique index if not exists rituals_check_in_code_idx on public.rituals (check_in_code);

-- ------------------------------------------------------------
-- ritual_signups — a user's request to join a ritual, waiting to
-- be bucketed into a pod by the weekly matching job.
-- ------------------------------------------------------------
create table if not exists public.ritual_signups (
  id uuid primary key default gen_random_uuid(),
  ritual_id uuid not null references public.rituals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'waiting'
    check (status in ('waiting', 'matched', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (ritual_id, user_id)
);

create index if not exists ritual_signups_status_idx
  on public.ritual_signups (ritual_id, status);

-- ------------------------------------------------------------
-- pods — a matched micro-group for a ritual
-- ------------------------------------------------------------
create table if not exists public.pods (
  id uuid primary key default gen_random_uuid(),
  ritual_id uuid not null references public.rituals (id) on delete cascade,
  name text,
  status text not null default 'active'
    check (status in ('active', 'disbanded')),
  created_at timestamptz not null default now()
);

create index if not exists pods_ritual_id_idx on public.pods (ritual_id);

-- ------------------------------------------------------------
-- pod_members — who's in each pod
-- ------------------------------------------------------------
create table if not exists public.pod_members (
  pod_id uuid not null references public.pods (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (pod_id, user_id)
);

create index if not exists pod_members_user_id_idx on public.pod_members (user_id);

-- ------------------------------------------------------------
-- attendance — one row per member per session date
-- ------------------------------------------------------------
create table if not exists public.attendance (
  pod_id uuid not null references public.pods (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_date date not null,
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  primary key (pod_id, user_id, session_date)
);

-- ------------------------------------------------------------
-- streaks — running attendance streak per member per pod
-- ------------------------------------------------------------
create table if not exists public.streaks (
  pod_id uuid not null references public.pods (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_session_date date,
  primary key (pod_id, user_id)
);

-- ------------------------------------------------------------
-- messages — pod chat, driven by Supabase Realtime
-- ------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  pod_id uuid not null references public.pods (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_pod_id_created_at_idx
  on public.messages (pod_id, created_at);

-- Turn on Realtime change streaming for pod chat. Guarded because
-- `alter publication ... add table` errors if run twice.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ------------------------------------------------------------
-- Row Level Security — members can only see their own pods
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.ritual_signups enable row level security;
alter table public.pod_members enable row level security;
alter table public.attendance enable row level security;
alter table public.streaks enable row level security;
alter table public.messages enable row level security;

create policy "profiles are viewable by their owner"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles are editable by their owner"
  on public.profiles for update using (auth.uid() = id);
create policy "profiles are insertable by their owner"
  on public.profiles for insert with check (auth.uid() = id);

create policy "users manage their own signups"
  on public.ritual_signups for all using (auth.uid() = user_id);

create policy "members can view their pod roster"
  on public.pod_members for select using (
    exists (
      select 1 from public.pod_members me
      where me.pod_id = pod_members.pod_id and me.user_id = auth.uid()
    )
  );

create policy "members can view their pod attendance"
  on public.attendance for select using (
    exists (
      select 1 from public.pod_members me
      where me.pod_id = attendance.pod_id and me.user_id = auth.uid()
    )
  );

create policy "members can view their pod streaks"
  on public.streaks for select using (
    exists (
      select 1 from public.pod_members me
      where me.pod_id = streaks.pod_id and me.user_id = auth.uid()
    )
  );

create policy "members can view their pod messages"
  on public.messages for select using (
    exists (
      select 1 from public.pod_members me
      where me.pod_id = messages.pod_id and me.user_id = auth.uid()
    )
  );

create policy "members can post to their pod"
  on public.messages for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.pod_members me
      where me.pod_id = messages.pod_id and me.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- ritual_signup_counts — aggregate "N people are in" counts for
-- the Phase 0 signup page. security definer because ritual_signups
-- itself is locked to each user's own rows; this only ever returns
-- a count per ritual, never who signed up.
-- ------------------------------------------------------------
create or replace function public.ritual_signup_counts()
returns table (ritual_id uuid, waiting_count bigint) as $$
  select ritual_id, count(*) as waiting_count
  from public.ritual_signups
  where status = 'waiting'
  group by ritual_id;
$$ language sql stable security definer;

grant execute on function public.ritual_signup_counts() to anon, authenticated;

-- ------------------------------------------------------------
-- venue_owners — links a profile to the venue(s) they manage, for
-- the venue partner dashboard. No self-serve signup yet: rows are
-- added by hand (SQL editor) when a venue partnership is set up.
-- ------------------------------------------------------------
create table if not exists public.venue_owners (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (venue_id, user_id)
);

alter table public.venue_owners enable row level security;

create policy "owners can see their own venue_owners rows"
  on public.venue_owners for select using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- my_venues / venue_dashboard_stats — the venue partner dashboard's
-- only two reads. Both are security definer and self-check
-- ownership via venue_owners inside the function body (RLS is
-- bypassed for security definer functions, so the check has to be
-- explicit) — a signed-in venue owner never sees another venue's
-- data, and stats are aggregate-only, never member names or contact
-- info.
-- ------------------------------------------------------------
create or replace function public.my_venues()
returns table (venue_id uuid, name text, city text, neighborhood text) as $$
  select v.id, v.name, v.city, v.neighborhood
  from public.venues v
  join public.venue_owners vo on vo.venue_id = v.id
  where vo.user_id = auth.uid();
$$ language sql stable security definer;

grant execute on function public.my_venues() to authenticated;

create or replace function public.venue_dashboard_stats(p_venue_id uuid)
returns table (
  ritual_id uuid,
  ritual_type text,
  day_of_week smallint,
  start_time time,
  waiting_count bigint,
  active_pod_count bigint,
  member_count bigint,
  avg_current_streak numeric,
  checkins_last_4_weeks bigint
) as $$
begin
  if not exists (
    select 1 from public.venue_owners
    where venue_id = p_venue_id and user_id = auth.uid()
  ) then
    raise exception 'not authorized for this venue';
  end if;

  return query
  select
    r.id,
    r.ritual_type,
    r.day_of_week,
    r.start_time,
    (
      select count(*) from public.ritual_signups rs
      where rs.ritual_id = r.id and rs.status = 'waiting'
    ) as waiting_count,
    (
      select count(*) from public.pods p
      where p.ritual_id = r.id and p.status = 'active'
    ) as active_pod_count,
    (
      select count(*) from public.pod_members pm
      join public.pods p on p.id = pm.pod_id
      where p.ritual_id = r.id and p.status = 'active'
    ) as member_count,
    (
      select coalesce(avg(s.current_streak), 0) from public.streaks s
      join public.pods p on p.id = s.pod_id
      where p.ritual_id = r.id and p.status = 'active'
    ) as avg_current_streak,
    (
      select count(*) from public.attendance a
      join public.pods p on p.id = a.pod_id
      where p.ritual_id = r.id and a.checked_in = true
        and a.session_date >= (current_date - interval '28 days')
    ) as checkins_last_4_weeks
  from public.rituals r
  where r.venue_id = p_venue_id;
end;
$$ language plpgsql stable security definer;

grant execute on function public.venue_dashboard_stats(uuid) to authenticated;

-- ------------------------------------------------------------
-- admins — allowlist of founder/staff accounts with full
-- cross-venue access, for the internal ops dashboard. No
-- self-serve signup: rows are added by hand (SQL editor).
-- ------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

create policy "admins can see their own admins row"
  on public.admins for select using (auth.uid() = user_id);

create or replace function public.is_admin()
returns boolean as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$ language sql stable security definer;

grant execute on function public.is_admin() to authenticated;

-- ------------------------------------------------------------
-- venues / rituals previously had no RLS at all. In Supabase that
-- doesn't mean "locked down" — it means anon/authenticated can read
-- *and write*, since Supabase grants CRUD to those roles by default
-- and RLS is what restricts it. That was harmless while nothing
-- ever wrote to these tables client-side, but the admin dashboard
-- is the first thing that needs write access, so this is the right
-- time to close it: public read stays exactly as before, writes
-- become admin-only.
-- ------------------------------------------------------------
alter table public.venues enable row level security;
alter table public.rituals enable row level security;

create policy "venues are publicly readable"
  on public.venues for select using (true);
create policy "admins can insert venues"
  on public.venues for insert with check (is_admin());
create policy "admins can update venues"
  on public.venues for update using (is_admin());
create policy "admins can delete venues"
  on public.venues for delete using (is_admin());

create policy "rituals are publicly readable"
  on public.rituals for select using (true);
create policy "admins can insert rituals"
  on public.rituals for insert with check (is_admin());
create policy "admins can update rituals"
  on public.rituals for update using (is_admin());
create policy "admins can delete rituals"
  on public.rituals for delete using (is_admin());

-- ------------------------------------------------------------
-- admin_overview / admin_waiting_signups — the ops dashboard's
-- cross-venue reads. Same security-definer + explicit is_admin()
-- check pattern as the venue dashboard's RPCs, just without
-- per-venue scoping — an admin sees every neighborhood at once.
-- ------------------------------------------------------------
create or replace function public.admin_overview()
returns table (
  ritual_id uuid,
  ritual_type text,
  day_of_week smallint,
  start_time time,
  venue_id uuid,
  venue_name text,
  neighborhood text,
  city text,
  waiting_count bigint,
  active_pod_count bigint,
  member_count bigint,
  avg_current_streak numeric
) as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select
    r.id,
    r.ritual_type,
    r.day_of_week,
    r.start_time,
    v.id,
    v.name,
    v.neighborhood,
    v.city,
    (select count(*) from public.ritual_signups rs where rs.ritual_id = r.id and rs.status = 'waiting'),
    (select count(*) from public.pods p where p.ritual_id = r.id and p.status = 'active'),
    (
      select count(*) from public.pod_members pm
      join public.pods p on p.id = pm.pod_id
      where p.ritual_id = r.id and p.status = 'active'
    ),
    (
      select coalesce(avg(s.current_streak), 0) from public.streaks s
      join public.pods p on p.id = s.pod_id
      where p.ritual_id = r.id and p.status = 'active'
    )
  from public.rituals r
  join public.venues v on v.id = r.venue_id
  order by v.neighborhood, v.name, r.ritual_type;
end;
$$ language plpgsql stable security definer;

grant execute on function public.admin_overview() to authenticated;

create or replace function public.admin_waiting_signups(p_ritual_id uuid)
returns table (signup_id uuid, user_id uuid, full_name text, created_at timestamptz) as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select rs.id, rs.user_id, pr.full_name, rs.created_at
  from public.ritual_signups rs
  join public.profiles pr on pr.id = rs.user_id
  where rs.ritual_id = p_ritual_id and rs.status = 'waiting'
  order by rs.created_at asc;
end;
$$ language plpgsql stable security definer;

grant execute on function public.admin_waiting_signups(uuid) to authenticated;
