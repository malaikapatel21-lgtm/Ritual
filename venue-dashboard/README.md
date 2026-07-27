# Venue partner dashboard

A read-only static page for venue staff: how many people are waiting
for each of their rituals, how many active pods, and whether those
pods are actually sticking (average streak, check-ins over the last 4
weeks). This is the Phase 3 "venue-side layer" — a second surface for
a second revenue line, not something pod members ever see.

## Setup

1. Run `../schema.sql` against your Supabase project — it adds
   `venue_owners` and two RPCs (`my_venues`, `venue_dashboard_stats`).
2. Link a venue to whoever runs it. There's no self-serve signup for
   this yet — do it by hand in the SQL editor once the person has
   signed in at least once (so their `profiles` row exists):
   ```sql
   insert into public.venue_owners (venue_id, user_id)
   values ('<venue-id>', '<their-profile-id>');
   ```
3. Copy `config.example.js` to `config.js` and fill in your project's
   URL and anon key.
4. Serve the directory with any static host, or locally:
   ```bash
   npx serve venue-dashboard
   ```

## How it works

- Sign-in reuses the same email + 6-digit-code flow as the rest of
  the app (Supabase auth) — no separate auth system.
- `my_venues()` returns only the venues the signed-in user owns (a
  security-definer RPC that joins through `venue_owners`); if that
  comes back empty, the page just says so.
- `venue_dashboard_stats(venue_id)` re-checks ownership of that
  specific venue *inside the function* before returning anything —
  necessary because security-definer functions bypass RLS, so the
  authorization check has to be explicit rather than relied on from
  policies. It returns aggregate counts only: waiting signups, active
  pods, member count, average current streak, and check-ins in the
  last 4 weeks — never member names or contact info.
- Rituals averaging under a 3-week streak get visually flagged. That
  number comes straight from the plan: "don't add payments until you
  have 3+ consecutive weeks of real attendance data per pod... if
  people stop showing up by week 3, that's a ritual/venue-fit
  problem, not a pricing problem."

## Design

Deliberately different from the consumer-facing signup page and
mobile app: a dark inverted variant of the same retro-poster system —
near-black background instead of cream paper — since this is a
backstage tool a venue owner checks after hours, not something shown
to members. Same Alfa Slab One / Barlow Condensed / Archivo type and
the same hard-shadow "stamped" cards and buttons as everywhere else in
the product, just pine-green-forward here instead of rust, so it still
reads as the same brand while staying visually distinct from the
admin tool.
