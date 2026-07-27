// ============================================================
// createPod — shared pod-creation routine
//
// Given a service-role client, a ritual_id, and the waiting
// ritual_signups rows to seat, creates the pod, seats its
// members, initializes streaks at 0, flips those signups to
// 'matched', and pushes a "you're in a pod!" notification.
// Used by both matchPods (automatic weekly matching) and
// adminFormPod (manual admin override) so the two paths can
// never drift out of sync on what "forming a pod" means.
// ============================================================

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendExpoPushToUsers } from "./expoPush.ts";

export interface SignupToSeat {
  id: string;
  user_id: string;
}

export async function createPod(
  supabase: SupabaseClient,
  ritualId: string,
  signups: SignupToSeat[],
): Promise<string> {
  const { data: pod, error: podError } = await supabase
    .from("pods")
    .insert({ ritual_id: ritualId })
    .select("id")
    .single();
  if (podError) throw podError;

  const memberRows = signups.map((s) => ({ pod_id: pod.id, user_id: s.user_id }));
  const { error: membersError } = await supabase.from("pod_members").insert(memberRows);
  if (membersError) throw membersError;

  const streakRows = signups.map((s) => ({
    pod_id: pod.id,
    user_id: s.user_id,
    current_streak: 0,
    longest_streak: 0,
  }));
  const { error: streaksError } = await supabase.from("streaks").insert(streakRows);
  if (streaksError) throw streaksError;

  const { error: updateError } = await supabase
    .from("ritual_signups")
    .update({ status: "matched" })
    .in("id", signups.map((s) => s.id));
  if (updateError) throw updateError;

  await sendExpoPushToUsers(
    supabase,
    signups.map((s) => s.user_id),
    "You're in a pod!",
    "Your weekly ritual pod is ready — say hi to your group.",
  );

  return pod.id as string;
}
