# Phase 0 signup page

A single static page for validating demand in one neighborhood before
building the full app: list the week's rituals, let people say "I'm in,"
and watch whether any slot actually reaches the minimum pod size (4).

No pods are formed here — that's `matchPods`, in Phase 1.

## Setup

1. Run `schema.sql` (repo root) against your Supabase project, then
   `web/seed.sql` to seed one neighborhood's venues and ritual slots.
2. In the Supabase dashboard, enable **Email** auth with magic links
   (Authentication → Providers → Email). No password needed.
3. Copy `config.example.js` to `config.js` and fill in your project's
   URL, anon key, and the neighborhood you seeded.
4. Serve the `web/` directory with any static host (Netlify, Vercel,
   GitHub Pages) or locally:
   ```bash
   npx serve web
   ```

## How it works

- Visitors sign in with a magic-link email (creates a real
  `auth.users` row, so signups land in the same schema Phase 1 builds
  on — no throwaway data model to migrate away from later).
- The page lists rituals in the configured neighborhood, each showing
  a live count of who's already in ("3 people in · 1 more to launch").
  Counts come from `ritual_signup_counts()`, an aggregate-only RPC —
  no one's identity is exposed to other visitors.
- Tapping "I'm in" inserts a row into `ritual_signups` with the
  default `status = 'waiting'`. That's it — no matching happens yet.

## Reading the result

Watch `ritual_signup_counts()` (or just query `ritual_signups`
directly) for a week or two. If no slot clears 4 signups, that's a
signal the ritual/venue choice is wrong — fix that before building
Phase 1's matching and mobile app.
