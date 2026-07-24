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
   (`ritual_signups.status = 'waiting'`), and groups them into pods
   of up to 8, refusing to launch a pod below the minimum viable
   size (default 4) — that's the guardrail against a pod that feels
   empty on day one. When `ANTHROPIC_API_KEY` is configured, Claude
   proposes the grouping (optimizing for shared vibe tags); its
   proposal is validated before use, and a missing key, an API
   error, or an invalid proposal falls back to plain deterministic
   bucketing, which never fails to produce valid pods. The
   guarantee comes first; the AI grouping is a quality layer on top
   of it, never a replacement for it.

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
- Push notifications (Expo) for pod-formed, session reminders, and
  streak milestones.

**Phase 3 — polish + defensibility**
- Manual check-in has been swapped for venue-code check-in: each
  ritual has a `check_in_code` (`schema.sql`), printed as a QR code
  (or a hand-written sign) at the venue, and the app scans it — or
  takes a typed fallback — before calling `handle_checkin`. Not
  cryptographic security, just a step up from a bare "I was there"
  tap; geofencing was the other option in the original plan but pulls
  in background-location permissions and App Store review overhead
  this doesn't need.
- Matching now has an AI-assisted layer (Claude groups by vibe-tag
  compatibility) on top of the original deterministic bucketing,
  which stays as the fallback. The original plan's caveat still
  applies in spirit: with only a handful of vibe tags per person and
  no attendance history yet, there's a low ceiling on how much
  better the AI grouping can actually do over even bucketing — watch
  real pod outcomes before leaning on it further.
- Venue partner dashboard (this is where it can merge with the
  "venue-side layer" idea from earlier if you want a second revenue line).

## Stack

- **Frontend:** React Native (Expo) — see `mobile/`
- **Backend:** Supabase (Postgres + Auth + Realtime + Edge Functions)
- **Scheduling:** pg_cron (built into Supabase) triggering `matchPods`
- **Push:** Expo push notifications

## What's built so far

- `schema.sql`, `streak_update.sql` — tables, RLS, and the
  check-in/streak RPC.
- `supabase/functions/matchPods` — the weekly matcher, now with an
  AI-assisted grouping pass (Claude via the official TypeScript SDK)
  that falls back to deterministic bucketing on any error or invalid
  proposal, plus a "you're in a pod!" push to every newly matched
  member.
- `supabase/functions/sendSessionReminders` — a daily job that pushes
  a reminder to every pod whose ritual falls tomorrow.
- `supabase/functions/sendPush` — a self-serve endpoint the mobile
  app calls to push-notify the *signed-in user's own* devices (used
  for streak-milestone celebrations); it never accepts a target
  user_id, so a client can only ever notify itself.
- `supabase/functions/_shared/expoPush.ts` — shared helper the three
  functions above use to actually send through Expo's push API.
- `web/` — a Phase 0 signup page for validating demand in a single
  neighborhood before building the full app.
- `mobile/` — the Phase 1 Expo app: magic-code sign-in, the
  onboarding wizard, and the pod home screen with check-in; Phase
  2's pod chat (Supabase Realtime on `messages`) and push
  notifications (pod-formed, session reminders, streak milestones);
  and an editorial visual redesign (Bodoni Moda display serif,
  vibe-tag-colorful palette, animated backgrounds and streak
  celebrations). See `mobile/README.md` for setup.

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

# 2. Set the AI-matching key (optional — matchPods falls back to
#    deterministic bucketing without it) and deploy the three functions.
#    _shared is not deployed as its own function; each function imports
#    it via a relative path.
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy matchPods
supabase functions deploy sendSessionReminders
supabase functions deploy sendPush

# 3. Schedule matchPods weekly (Sunday 9pm UTC) and
#    sendSessionReminders daily (9am UTC) via pg_cron.
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

select cron.schedule(
  'daily-session-reminders',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/sendSessionReminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    )
  );
  $$
);
```

`sendPush` isn't scheduled — it's called directly by the mobile app
(with the signed-in user's own JWT) whenever a streak milestone is
hit.
