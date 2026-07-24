# Ritual Pods — MVP Build Plan

Recurring micro-groups (5–8 people) anchored to a real venue and a
weekly ritual (walk, sauna, run club, yoga). Wellness is the reason
to show up; community is the retention engine.

## How the three files connect

1. **`schema.sql`** — run this first in Supabase (SQL editor or
   migration). It creates every table the app touches: profiles,
   venues, rituals, signups, pods, attendance, streaks, messages.

2. **`supabase/functions/matchPods/index.ts`** — deploy as a
   Supabase Edge Function. This is the weekly cron job: it reads
   everyone who signed up but hasn't been matched
   (`ritual_signups.status = 'waiting'`), buckets them into pods of
   up to 8, and refuses to launch a pod below the minimum viable
   size (default 4) — that's the guardrail against a pod that feels
   empty on day one.

3. **`streak_update.sql`** — run once alongside the schema. Your
   app calls `handle_checkin(pod_id, user_id, session_date)` via
   an RPC whenever someone taps "I'm here." It logs attendance and
   updates the streak in one transaction.

## End-to-end flow

```
User signs up for a ritual
        ↓
  ritual_signups (status: waiting)
        ↓
  [Sunday night] matchPods runs
        ↓
  pods created, pod_members inserted, streaks initialized
        ↓
  App shows pod home screen + push notification "You're in a pod!"
        ↓
  Session day → user taps check-in → handle_checkin() RPC
        ↓
  attendance logged, streak updated
        ↓
  Pod chat (messages table) active throughout the week
```

## Build order (matches the phased plan)

**Phase 0 — validate demand (1–2 weeks)**
- Static list of rituals/venues for ONE neighborhood only.
- Simple signup form writing directly to `ritual_signups`.
- No pods yet. Goal: see if enough people pick the *same* slot to
  even form a pod. If no slot gets 4+ signups, the ritual/venue
  choice is wrong — fix that before writing more code.

**Phase 1 — core loop (3–4 weeks)**
- Supabase auth + `profiles` table.
- Onboarding flow: city → ritual type → venue/time → 1–2 vibe tags.
- Deploy `matchPods` on a weekly schedule (pg_cron or external
  scheduler hitting the Edge Function URL).
- Pod home screen: members list, next session, streak count.
- Manual check-in button calling `handle_checkin()`.

**Phase 2 — retention layer**
- Pod chat using Supabase Realtime on the `messages` table.
- Push notifications (Expo) for session reminders and streak milestones.

**Phase 3 — polish + defensibility**
- Swap manual check-in for geofenced or QR/venue-code check-in.
- Refine matching with vibe tags (still rules-based, not ML — you
  don't have enough data for ML to help at this stage).
- Venue partner dashboard (this is where it can merge with the
  "venue-side layer" idea from earlier if you want a second revenue line).

## Stack

- **Frontend:** React Native or Flutter
- **Backend:** Supabase (Postgres + Auth + Realtime + Edge Functions)
- **Scheduling:** pg_cron (built into Supabase) triggering `matchPods`
- **Push:** Expo push notifications

## The one number that matters before you monetize

Don't add payments until you have 3+ consecutive weeks of real
attendance data per pod. If people stop showing up by week 3,
that's a ritual/venue-fit problem, not a pricing problem — fix
that first.

## Deploying the backend

```bash
# 1. Run the schema and streak function in the Supabase SQL editor
#    (or via `supabase db push` if you've wired these into migrations).
psql "$DATABASE_URL" -f schema.sql
psql "$DATABASE_URL" -f streak_update.sql

# 2. Deploy the weekly matching job.
supabase functions deploy matchPods

# 3. Schedule it (pg_cron example — Sunday 9pm UTC).
select cron.schedule(
  'weekly-pod-matching',
  '0 21 * * 0',
  $$
  select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/matchPods',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    )
  );
  $$
);
```
