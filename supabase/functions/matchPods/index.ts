// ============================================================
// matchPods — weekly pod-matching job
//
// Deploy as a Supabase Edge Function and trigger it on a weekly
// schedule (pg_cron hitting this function's URL, or an external
// scheduler). It reads everyone who signed up but hasn't been
// matched (ritual_signups.status = 'waiting'), buckets them into
// pods of up to MAX_POD_SIZE, and refuses to launch a pod below
// MIN_POD_SIZE — the guardrail against a pod that feels empty on
// day one. Leftover signups stay 'waiting' for next week.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_MIN_POD_SIZE = 4;
const DEFAULT_MAX_POD_SIZE = 8;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface WaitingSignup {
  id: string;
  ritual_id: string;
  user_id: string;
  created_at: string;
}

interface Ritual {
  id: string;
  min_pod_size: number;
  max_pod_size: number;
}

// Split a FIFO-ordered list of signups into pods whose sizes all
// fall within [minSize, maxSize], as evenly as possible. Returns
// the pods plus any leftover signups too few to form one.
export function planPods<T>(
  signups: T[],
  minSize: number,
  maxSize: number,
): { pods: T[][]; leftover: T[] } {
  const total = signups.length;
  if (total < minSize) {
    return { pods: [], leftover: signups };
  }

  const avgSize = (minSize + maxSize) / 2;
  let podCount = Math.max(1, Math.round(total / avgSize));
  while (Math.ceil(total / podCount) > maxSize) podCount++;
  while (podCount > 1 && Math.floor(total / podCount) < minSize) podCount--;

  const baseSize = Math.floor(total / podCount);
  const remainder = total % podCount;

  const pods: T[][] = [];
  let cursor = 0;
  for (let i = 0; i < podCount; i++) {
    const size = baseSize + (i < remainder ? 1 : 0);
    pods.push(signups.slice(cursor, cursor + size));
    cursor += size;
  }

  return { pods, leftover: [] };
}

async function matchPods() {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: waiting, error: waitingError } = await supabase
    .from("ritual_signups")
    .select("id, ritual_id, user_id, created_at")
    .eq("status", "waiting")
    .order("created_at", { ascending: true });

  if (waitingError) throw waitingError;
  if (!waiting || waiting.length === 0) {
    return { podsCreated: 0, usersMatched: 0, usersStillWaiting: 0 };
  }

  const ritualIds = [...new Set(waiting.map((s) => s.ritual_id))];
  const { data: rituals, error: ritualsError } = await supabase
    .from("rituals")
    .select("id, min_pod_size, max_pod_size")
    .in("id", ritualIds);

  if (ritualsError) throw ritualsError;

  const ritualById = new Map<string, Ritual>(
    (rituals ?? []).map((r) => [r.id, r]),
  );

  const signupsByRitual = new Map<string, WaitingSignup[]>();
  for (const signup of waiting as WaitingSignup[]) {
    const bucket = signupsByRitual.get(signup.ritual_id) ?? [];
    bucket.push(signup);
    signupsByRitual.set(signup.ritual_id, bucket);
  }

  let podsCreated = 0;
  let usersMatched = 0;
  let usersStillWaiting = 0;

  for (const [ritualId, signups] of signupsByRitual) {
    const ritual = ritualById.get(ritualId);
    const minSize = ritual?.min_pod_size ?? DEFAULT_MIN_POD_SIZE;
    const maxSize = ritual?.max_pod_size ?? DEFAULT_MAX_POD_SIZE;

    const { pods, leftover } = planPods(signups, minSize, maxSize);
    usersStillWaiting += leftover.length;

    for (const podSignups of pods) {
      const { data: pod, error: podError } = await supabase
        .from("pods")
        .insert({ ritual_id: ritualId })
        .select("id")
        .single();

      if (podError) throw podError;

      const memberRows = podSignups.map((s) => ({
        pod_id: pod.id,
        user_id: s.user_id,
      }));
      const { error: membersError } = await supabase
        .from("pod_members")
        .insert(memberRows);
      if (membersError) throw membersError;

      const streakRows = podSignups.map((s) => ({
        pod_id: pod.id,
        user_id: s.user_id,
        current_streak: 0,
        longest_streak: 0,
      }));
      const { error: streaksError } = await supabase
        .from("streaks")
        .insert(streakRows);
      if (streaksError) throw streaksError;

      const { error: updateError } = await supabase
        .from("ritual_signups")
        .update({ status: "matched" })
        .in("id", podSignups.map((s) => s.id));
      if (updateError) throw updateError;

      podsCreated++;
      usersMatched += podSignups.length;
    }
  }

  return { podsCreated, usersMatched, usersStillWaiting };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const result = await matchPods();
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("matchPods failed", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
