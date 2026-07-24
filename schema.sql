-- ============================================================
-- RITUAL PODS — CORE SCHEMA
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
  created_at timestamptz not null default now()
);

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
  created_at timestamptz not null default now()
);

create index if not exists rituals_venue_id_idx on public.rituals (venue_id);

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
