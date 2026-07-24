# Ops dashboard

An internal tool for the founder (or whoever's running the ops side) to
manage rituals and venues across every neighborhood, and to manually form
a pod outside the weekly matching run. This is separate from the
[venue partner dashboard](../venue-dashboard) — that one is read-only and
scoped to a single venue owner's own numbers; this one has write access
and sees everything.

## Setup

1. Run `../schema.sql` against your Supabase project — it adds the
   `admins` table, `is_admin()`, RLS on `venues`/`rituals` (public read,
   admin-only write), and the `admin_overview()` / `admin_waiting_signups()`
   RPCs.
2. Deploy `../supabase/functions/adminFormPod` — the Edge Function this
   page calls to form a pod from hand-picked signups.
3. Make yourself an admin. There's no self-serve way to do this
   deliberately — granting admin access is not something to expose behind
   a form. Sign in at least once (so your `profiles` row exists), then in
   the SQL editor:
   ```sql
   insert into public.admins (user_id) values ('<your-profile-id>');
   ```
4. Copy `config.example.js` to `config.js` and fill in your project's URL
   and anon key.
5. Serve the directory with any static host, or locally:
   ```bash
   npx serve admin
   ```

## How it works

- Sign-in reuses the same email + 6-digit-code flow as the rest of the
  app. After signing in, the page calls `is_admin()`; if that comes back
  false, it shows a "not an admin" screen instead of the dashboard — it
  never shows admin data to a signed-in non-admin.
- **Overview** — `admin_overview()`, a security-definer RPC that checks
  `is_admin()` internally before returning anything, lists every ritual
  across every venue with waiting/active-pod/member/streak counts.
- **Venues** and **Rituals** — plain reads and writes against those
  tables. Reads work for anyone (they're public); writes only work for
  admins, enforced by the RLS policies added in `schema.sql` — an admin
  session can insert/update/delete, anyone else's write is rejected by
  Postgres itself, not just hidden by the UI. "Regenerate code" swaps a
  ritual's `check_in_code` for a fresh random one (e.g. if a venue's
  printed QR code gets damaged or someone leaks it).
- **Manual match** — picks up where the weekly `matchPods` job leaves
  off: pick a ritual, see who's still `waiting` (via
  `admin_waiting_signups()`, another `is_admin()`-gated RPC that also
  returns each person's name), check off who should be seated together,
  and hit "Form pod." That calls the `adminFormPod` Edge Function, which
  re-checks `is_admin()` itself (never trusts the client), then reuses
  the exact same pod-creation logic as the automatic matcher
  (`supabase/functions/_shared/createPod.ts`) — same push notification,
  same streak initialization, same signup-status flip. The one
  deliberate difference: it does **not** enforce `min_pod_size`. That
  guardrail exists to stop the automatic matcher from launching a pod
  that feels empty; a human manually deciding "these 3 people should
  start now" is exactly the override this tool exists for.
  `max_pod_size` is still enforced, as a sanity bound.

## Deliberately out of scope

Linking a venue to its owner (the `venue_owners` table the venue
dashboard reads from) still isn't self-serve here — assigning it by
email would need an admin-privileged user lookup, which is more sensitive
than the CRUD above and doesn't have enough demand yet to justify
building. It's still a manual SQL insert, documented in
`../venue-dashboard/README.md`.
