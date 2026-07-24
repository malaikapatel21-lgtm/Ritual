# Ritual — mobile app

Expo (React Native) app for the core loop: onboarding into a ritual, a
pod home screen, chat, push notifications, and venue-code check-in.
Talks directly to the same Supabase project as `../schema.sql`,
`../supabase/functions/matchPods`, and `../streak_update.sql`.

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
  button (enabled only on the ritual's session day) that opens the
  check-in scanner and, once verified, calls the `handle_checkin`
  RPC, plus a link into `chat.tsx`.

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

## Venue-code check-in

Tapping "I'm here" opens `src/components/CheckInScanner.tsx` instead of
checking in directly: a full-screen `expo-camera` `CameraView` scanning
for the QR code posted at the venue (with a "enter it manually" text
fallback for when there's no camera access or no physical sign yet).
The scanned/typed value is compared against that ritual's
`check_in_code` (`schema.sql`) before `index.tsx` calls
`handle_checkin` — this is a physical-presence proxy, not
cryptographic security, since `rituals` has no RLS and the code is
readable by the app the same as any other ritual field. `web/seed.sql`
has demo codes (`SAUNA1`, `WALK01`, etc.) for the seeded rituals so
the flow is testable without printing anything.

## Design system

Bold retro-poster, not a soft editorial look: `src/lib/theme.ts` holds
a flat vintage-athletic-club palette (aged cream paper, ink black,
rust/pine/mustard/denim accents — no gradients) and three type roles —
Alfa Slab One for display headlines, Barlow Condensed for uppercase
labels and buttons, Archivo for body copy. Ritual types get their own
accent color (`accentForRitual`), so a sauna pod and a yoga pod don't
look identical. `src/components/Screen.tsx` is the shared root
wrapper: a flat paper background, a bold printed color band across the
top, and a slow-rotating sunburst (plain Views, no image assets)
behind the header — a classic vintage-badge device. `PrimaryButton.tsx`
and `StreakBadge.tsx` use a "stamped" hard-shadow device — a solid
ink-colored duplicate sits offset behind the fill — throughout:
pressing a button slides it down onto its shadow like a printed button
being pushed flat, and the streak count is a circular badge with a
permanent slight tilt, like a rubber-stamped seal. `PosterCard.tsx` is
the same hard-shadow treatment for list rows and options. Screen
transitions and incoming chat messages use Reanimated's built-in
`FadeIn*` entering animations rather than anything hand-rolled.

## Mobile-native polish

A pass to make the app feel like a real native app rather than a
website in a phone-shaped window:

- **Haptics** (`src/lib/haptics.ts`) — every `PrimaryButton` press, each
  OTP digit entered, each onboarding step advance, a check-in
  succeeding or failing, and sending a chat message all fire the
  matching `expo-haptics` feedback (light impact, selection, success,
  error). The helper no-ops on web and swallows any rejection, so it's
  always safe to call and never something a screen has to `await`.
- **Safe areas** — `Screen.tsx` now reads real device insets via
  `useSafeAreaInsets()` (Expo Router already wraps the app in a
  `SafeAreaProvider`, so this needed no extra provider) instead of
  guessing a fixed top padding per screen. `CheckInScanner`, which
  renders as its own full-screen overlay outside `Screen`, insets
  itself the same way.
- **Confetti** (`src/components/ConfettiBurst.tsx`) — a hand-rolled
  Reanimated particle burst (sharp-edged rectangles and squares in the
  poster palette, no added native dependency), reused for three
  moments: finishing onboarding, a live waiting → matched transition on
  the pod home screen, and a streak milestone (layered behind
  `StreakBadge`'s "stamp impact" punch animation).
- **OTP entry** (`verify.tsx`) — six auto-advancing digit boxes
  instead of one text field: typing a digit jumps to the next box,
  backspacing an empty box jumps back, pasting a full code fills every
  box and submits immediately, and a wrong code shakes the row and
  clears it instead of just showing red text.
- **Pod home** (`index.tsx`) — pull-to-refresh (both the waiting state
  and the matched state), a staggered fade-in for each pod member
  instead of all appearing at once, and — the biggest one — detecting
  a *live* `waiting` → `matched` transition (the weekly matcher ran, or
  an admin manually formed a pod, while the screen happened to be
  open) and taking over the screen with a full "You're in a pod!"
  reveal + confetti for a couple of seconds before showing the normal
  pod view. It deliberately only fires on an observed transition, never
  on a pod that already existed before the screen mounted — reopening
  the app to an already-formed pod shouldn't replay a celebration that
  already happened.
- **Check-in** (`CheckInScanner.tsx`) — a scanned or typed code that
  matches now shows a brief animated checkmark instead of instantly
  vanishing, so there's a visible confirmation moment before the
  overlay closes and the check-in RPC fires.

## Notes

- `app.json`'s `web.output` is set to `single` (SPA), not `static`.
  Static (server-prerendered) export crashes on this app because the
  Supabase client's AsyncStorage-backed session lookup touches
  `window` during Node-side prerendering — web is a secondary target
  here anyway; iOS/Android are the point.
