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
//
// Grouping strategy: when ANTHROPIC_API_KEY is configured, Claude
// proposes the grouping, optimizing for shared vibe tags within
// each pod. Its proposal is validated (every signup assigned to
// exactly one pod, every pod within [min, max]) before use — an
// unconfigured key, an API error, or an invalid proposal falls
// back to the deterministic bucketing below, which never fails to
// produce valid pods. AI grouping is a quality improvement layered
// on top of a guarantee, never a replacement for it.
// ============================================================

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.112.5";
import { createPod } from "../_shared/createPod.ts";

const DEFAULT_MIN_POD_SIZE = 4;
const DEFAULT_MAX_POD_SIZE = 8;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
const anthropic = anthropicApiKey ? new Anthropic({ apiKey: anthropicApiKey }) : null;

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
// the pods plus any leftover signups too few to form one. This is
// the reliability floor: it never fails to produce valid pods for
// any total >= minSize, and is what AI-proposed groupings fall
// back to when unavailable or invalid.
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

const PROPOSE_PODS_TOOL = {
  name: "propose_pods",
  description:
    "Propose how to split a list of people into pods (small recurring groups) for a shared weekly ritual, grouping people with compatible vibe tags together where possible.",
  input_schema: {
    type: "object" as const,
    properties: {
      pods: {
        type: "array",
        description:
          "Each element is one pod, given as an array of the user_id strings assigned to it. Every user_id from the input must appear in exactly one pod — none omitted, none invented.",
        items: { type: "array", items: { type: "string" } },
      },
    },
    required: ["pods"],
  },
};

function isValidPodPlan(
  pods: string[][],
  expectedUserIds: string[],
  minSize: number,
  maxSize: number,
): boolean {
  if (pods.length === 0) return false;
  const seen = new Set<string>();
  for (const pod of pods) {
    if (pod.length < minSize || pod.length > maxSize) return false;
    for (const id of pod) {
      if (seen.has(id)) return false; // assigned to more than one pod
      seen.add(id);
    }
  }
  if (seen.size !== expectedUserIds.length) return false;
  return expectedUserIds.every((id) => seen.has(id));
}

/** Asks Claude to group people by shared vibe tags. Returns null (triggering the
 * deterministic fallback) on a missing API key, an API error, or any proposal
 * that doesn't cleanly partition every signup into a valid-sized pod. */
async function proposePodsWithAI(
  userIds: string[],
  vibeTagsByUser: Map<string, string[]>,
  minSize: number,
  maxSize: number,
): Promise<string[][] | null> {
  if (!anthropic) return null;

  const people = userIds.map((userId) => ({
    user_id: userId,
    vibe_tags: vibeTagsByUser.get(userId) ?? [],
  }));

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      tools: [PROPOSE_PODS_TOOL],
      messages: [
        {
          role: "user",
          content:
            `Split these ${people.length} people into pods (small recurring groups) for a shared weekly ritual. ` +
            `Every pod must have between ${minSize} and ${maxSize} people, inclusive. Every person must end up in ` +
            `exactly one pod — don't omit anyone and don't invent people who aren't listed. Optimize each pod's ` +
            `compatibility using the vibe_tags each person listed (their self-described interests/preferences): ` +
            `people who share vibe tags should generally end up in the same pod, but every pod must still meet the ` +
            `size range even if that means mixing different vibes. A person with no vibe tags is compatible with ` +
            `anyone.\n\nPeople:\n${JSON.stringify(people)}`,
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === "tool_use" && block.name === "propose_pods",
    );
    if (!toolUse) return null;

    const rawPods = (toolUse.input as { pods?: unknown }).pods;
    if (!Array.isArray(rawPods)) return null;

    const pods = rawPods.map((pod) =>
      Array.isArray(pod) ? pod.filter((id): id is string => typeof id === "string") : []
    );

    if (!isValidPodPlan(pods, userIds, minSize, maxSize)) return null;
    return pods;
  } catch (error) {
    console.error("AI pod matching failed, falling back to deterministic bucketing", error);
    return null;
  }
}

async function fetchVibeTags(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string[]>> {
  const { data, error } = await supabase.from("profiles").select("id, vibe_tags").in("id", userIds);
  if (error || !data) return new Map();
  return new Map(data.map((p) => [p.id as string, (p.vibe_tags as string[]) ?? []]));
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
    return { podsCreated: 0, usersMatched: 0, usersStillWaiting: 0, aiMatchedPods: 0 };
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
  let aiMatchedPods = 0;

  for (const [ritualId, signups] of signupsByRitual) {
    const ritual = ritualById.get(ritualId);
    const minSize = ritual?.min_pod_size ?? DEFAULT_MIN_POD_SIZE;
    const maxSize = ritual?.max_pod_size ?? DEFAULT_MAX_POD_SIZE;

    if (signups.length < minSize) {
      usersStillWaiting += signups.length;
      continue;
    }

    const signupByUser = new Map(signups.map((s) => [s.user_id, s]));
    let podsOfSignups: WaitingSignup[][] = planPods(signups, minSize, maxSize).pods;
    let usedAI = false;

    const vibeTagsByUser = await fetchVibeTags(
      supabase,
      signups.map((s) => s.user_id),
    );
    const aiPods = await proposePodsWithAI(
      signups.map((s) => s.user_id),
      vibeTagsByUser,
      minSize,
      maxSize,
    );
    if (aiPods) {
      podsOfSignups = aiPods.map((pod) => pod.map((uid) => signupByUser.get(uid)!));
      usedAI = true;
    }

    for (const podSignups of podsOfSignups) {
      await createPod(supabase, ritualId, podSignups);
      podsCreated++;
      usersMatched += podSignups.length;
      if (usedAI) aiMatchedPods++;
    }
  }

  return { podsCreated, usersMatched, usersStillWaiting, aiMatchedPods };
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
