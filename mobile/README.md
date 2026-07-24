# Ritual Pods — mobile app

Expo (React Native) app for Phase 1's core loop: onboarding into a
ritual, a pod home screen, and manual check-in. Talks directly to the
same Supabase project as `../schema.sql`, `../supabase/functions/matchPods`,
and `../streak_update.sql`.

## Setup

1. Run `../schema.sql` (and `../web/seed.sql` if you want sample data)
   against your Supabase project.
2. In the Supabase dashboard, enable **Email** auth with OTP codes
   (Authentication → Providers → Email — the default template sends a
   6-digit code, which this app's sign-in flow expects).
3. Copy `.env.example` to `.env` and fill in your project's URL and
   anon key.
4. For push notifications to actually register a token, run `eas init`
   once and add the resulting project ID to `app.json` as
   `expo.extra.eas.projectId`. Without it, `registerPushToken` logs a
   warning and skips registration — everything else still works.
5. Install dependencies and start the dev server:
   ```bash
   npm install
   npx expo start
   ```
   Scan the QR code with Expo Go, or press `i`/`a` for a simulator.
   Push notifications always need a real device, not a simulator —
   and on Android specifically, Expo Go can't receive remote push at
   all as of SDK 53 (iOS Expo Go still can). Use an EAS development
   build to test push notifications on Android.

## How it's structured

File-based routing via Expo Router, with routes gated centrally in
`src/app/_layout.tsx` using `Stack.Protected`:

- No session → `sign-in.tsx` (email) → `verify.tsx` (OTP code).
- Session but no `ritual_signups` row yet → `onboarding.tsx`, a
  four-step wizard (city → ritual type → venue/time → up to 2 vibe
  tags) that upserts `profiles` and inserts into `ritual_signups`.
- Session + already signed up → `index.tsx`, the pod home screen. It
  shows a "you're on the list" state while `ritual_signups.status`
  is `waiting`, and once `matchPods` runs and flips it to `matched`,
  shows the pod roster, streak count, next session, an "I'm here"
  button (enabled only on the ritual's session day) that calls the
  `handle_checkin` RPC, and a link into `chat.tsx`.

`src/lib/AuthProvider.tsx` holds the Supabase session and an
`onboardingComplete` flag (derived from whether any `ritual_signups`
row exists) that the root layout uses to decide which stack to show.
`src/lib/usePodMembership.ts` holds the shared "what's my signup
status / ritual / pod / members / streak" lookup that both the pod
home screen and chat screen build on.

## Pod chat

`chat.tsx` subscribes to Supabase Realtime's `postgres_changes` on
`messages`, filtered to the current pod (`pod_id=eq.<id>`), and
merges incoming rows into state by `id` so an incoming realtime event
for a message you just sent never shows up twice regardless of which
resolves first — the local insert response or the realtime broadcast.
Enabling this required one schema change: `messages` has to be added
to the `supabase_realtime` publication (see `../schema.sql`), since a
table isn't Realtime-enabled by default just because RLS policies
exist on it.

## Push notifications

`src/lib/registerPushToken.ts` requests permission, gets an Expo push
token, and saves it to `profiles.push_token` — `AuthProvider` calls it
once a session exists. Three notifications flow through this:

- **"You're in a pod!"** — sent server-side from `matchPods` to every
  newly matched member.
- **Session reminders** — sent server-side, daily, from
  `sendSessionReminders`.
- **Streak milestones** — `src/lib/streakMilestones.ts` detects a
  milestone (3, then every 5) right after a successful check-in and
  calls the `sendPush` Edge Function, which only ever notifies the
  *caller's own* devices (it reads the target user from the caller's
  JWT, never from the request body — a client can't push-notify anyone
  else).

## Design system

`src/lib/theme.ts` holds an editorial palette (warm ivory background,
a handful of jewel-tone accents) and the Bodoni Moda display serif
used for headings — the same family of typeface fashion-magazine
mastheads use. Ritual types get their own accent color
(`accentForRitual`), so a sauna pod and a yoga pod don't look
identical. `src/components/Screen.tsx` is the shared root wrapper:
every screen gets the gradient backdrop with two slow-drifting color
blobs behind the content. `PrimaryButton.tsx` and `StreakBadge.tsx`
are the other two reusable pieces — the button has a press-scale
animation, and the badge has a slow breathing pulse plus a one-shot
spark burst when a streak milestone lands. Screen transitions and
incoming chat messages use Reanimated's built-in `FadeIn*` entering
animations rather than anything hand-rolled.

## Notes

- `app.json`'s `web.output` is set to `single` (SPA), not `static`.
  Static (server-prerendered) export crashes on this app because the
  Supabase client's AsyncStorage-backed session lookup touches
  `window` during Node-side prerendering — web is a secondary target
  here anyway; iOS/Android are the point.
