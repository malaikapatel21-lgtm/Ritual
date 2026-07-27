-- ============================================================
-- STREAK UPDATE — call this after a user checks in to a session
-- ============================================================

create or replace function public.handle_checkin(
  p_pod_id uuid,
  p_user_id uuid,
  p_session_date date
) returns void as $$
declare
  v_last_date date;
  v_current int;
  v_longest int;
begin
  -- Record attendance
  insert into public.attendance (pod_id, user_id, session_date, checked_in, checked_in_at)
  values (p_pod_id, p_user_id, p_session_date, true, now())
  on conflict (pod_id, user_id, session_date)
  do update set checked_in = true, checked_in_at = now();

  -- Pull existing streak state
  select last_session_date, current_streak, longest_streak
    into v_last_date, v_current, v_longest
  from public.streaks
  where pod_id = p_pod_id and user_id = p_user_id;

  if not found then
    insert into public.streaks (pod_id, user_id, current_streak, longest_streak, last_session_date)
    values (p_pod_id, p_user_id, 1, 1, p_session_date);
    return;
  end if;

  -- If last session was ~7 days ago (one ritual cycle), extend the streak.
  -- Otherwise reset to 1. Adjust the interval if a ritual isn't weekly.
  if v_last_date is not null and p_session_date - v_last_date between 5 and 9 then
    v_current := v_current + 1;
  else
    v_current := 1;
  end if;

  v_longest := greatest(v_longest, v_current);

  update public.streaks
  set current_streak = v_current,
      longest_streak = v_longest,
      last_session_date = p_session_date
  where pod_id = p_pod_id and user_id = p_user_id;
end;
$$ language plpgsql security definer;
