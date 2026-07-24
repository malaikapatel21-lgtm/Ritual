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
4. Install dependencies and start the dev server:
   ```bash
   npm install
   npx expo start
   ```
   Scan the QR code with Expo Go, or press `i`/`a` for a simulator.

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
  shows the pod roster, streak count, and next session, with an
  "I'm here" button (enabled only on the ritual's session day) that
  calls the `handle_checkin` RPC.

`src/lib/AuthProvider.tsx` holds the Supabase session and an
`onboardingComplete` flag (derived from whether any `ritual_signups`
row exists) that the root layout uses to decide which stack to show.

## Notes

- `app.json`'s `web.output` is set to `single` (SPA), not `static`.
  Static (server-prerendered) export crashes on this app because the
  Supabase client's AsyncStorage-backed session lookup touches
  `window` during Node-side prerendering — web is a secondary target
  here anyway; iOS/Android are the point.
- Push notifications (Expo) and pod chat (Realtime on `messages`) are
  Phase 2, not built yet.
