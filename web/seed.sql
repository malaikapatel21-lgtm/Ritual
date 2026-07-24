-- ============================================================
-- PHASE 0 SEED — one neighborhood, a handful of ritual slots.
-- Run after schema.sql. Edit the neighborhood/venues/rituals to
-- match your actual test market before sharing the signup link.
-- ============================================================

insert into public.venues (id, name, address, city, neighborhood) values
  ('a1000000-0000-0000-0000-000000000001', 'Fremont Sauna House', '123 N 36th St', 'Seattle', 'Fremont'),
  ('a1000000-0000-0000-0000-000000000002', 'Fremont Canal Path',  'Canal Park Trailhead', 'Seattle', 'Fremont'),
  ('a1000000-0000-0000-0000-000000000003', 'Fremont Yoga Loft',   '456 Evanston Ave N', 'Seattle', 'Fremont')
on conflict (id) do nothing;

insert into public.rituals (id, venue_id, ritual_type, day_of_week, start_time, min_pod_size, max_pod_size) values
  ('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'sauna',     4, '18:00', 4, 8), -- Thursday
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'walk',      2, '07:00', 4, 8), -- Tuesday
  ('b2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 'run club',  6, '08:00', 4, 8), -- Saturday
  ('b2000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000003', 'yoga',      0, '09:00', 4, 8)  -- Sunday
on conflict (id) do nothing;
