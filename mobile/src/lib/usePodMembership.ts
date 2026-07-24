import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { toISODate } from "@/lib/dates";
import type { PodMemberProfile, RitualInfo, SignupStatus, Streak } from "@/lib/types";

interface PodMembership {
  loading: boolean;
  status: SignupStatus | null;
  ritual: RitualInfo | null;
  podId: string | null;
  members: PodMemberProfile[];
  streak: Streak | null;
  checkedInToday: boolean;
  /** Re-fetches everything and returns the freshly-loaded streak (or null),
   * so callers that need the authoritative post-refresh value (e.g. to
   * detect a milestone) don't have to guess at it from stale closure state. */
  refresh: () => Promise<Streak | null>;
}

/** Looks up the signed-in user's latest ritual signup and, once matched, their pod. */
export function usePodMembership(): PodMembership {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SignupStatus | null>(null);
  const [ritual, setRitual] = useState<RitualInfo | null>(null);
  const [podId, setPodId] = useState<string | null>(null);
  const [members, setMembers] = useState<PodMemberProfile[]>([]);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [checkedInToday, setCheckedInToday] = useState(false);

  const load = useCallback(async (): Promise<Streak | null> => {
    if (!session) return null;
    setLoading(true);

    const { data: signup } = await supabase
      .from("ritual_signups")
      .select("status, rituals(id, ritual_type, day_of_week, start_time, check_in_code, venues(name))")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!signup) {
      setLoading(false);
      return null;
    }

    const ritualInfo = signup.rituals as unknown as RitualInfo;
    setStatus(signup.status as SignupStatus);
    setRitual(ritualInfo);

    let freshStreak: Streak | null = null;

    if (signup.status === "matched" && ritualInfo) {
      const { data: membership } = await supabase
        .from("pod_members")
        .select("pod_id, pods!inner(ritual_id)")
        .eq("user_id", session.user.id)
        .eq("pods.ritual_id", ritualInfo.id)
        .limit(1)
        .maybeSingle();

      if (membership) {
        const currentPodId = membership.pod_id as string;
        setPodId(currentPodId);

        const [{ data: memberRows }, { data: streakRow }, { data: attendanceRow }] = await Promise.all([
          supabase.from("pod_members").select("user_id, profiles(full_name)").eq("pod_id", currentPodId),
          supabase
            .from("streaks")
            .select("current_streak, longest_streak, last_session_date")
            .eq("pod_id", currentPodId)
            .eq("user_id", session.user.id)
            .maybeSingle(),
          supabase
            .from("attendance")
            .select("checked_in")
            .eq("pod_id", currentPodId)
            .eq("user_id", session.user.id)
            .eq("session_date", toISODate(new Date()))
            .maybeSingle(),
        ]);

        setMembers(
          (memberRows ?? []).map((row) => ({
            user_id: row.user_id,
            full_name: (row.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
          }))
        );
        freshStreak = streakRow ?? { current_streak: 0, longest_streak: 0, last_session_date: null };
        setStreak(freshStreak);
        setCheckedInToday(attendanceRow?.checked_in ?? false);
      }
    }

    setLoading(false);
    return freshStreak;
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  return { loading, status, ritual, podId, members, streak, checkedInToday, refresh: load };
}
