// ============================================================
// adminFormPod — manual pod-formation override for the ops
// dashboard
//
// Lets an admin hand-pick waiting signups for a ritual and form
// a pod immediately, instead of waiting for the weekly matchPods
// run. Deliberately does NOT enforce MIN_POD_SIZE — that guardrail
// exists to stop the automatic matcher from launching a pod that
// feels empty, but a human deciding "these 3 people should start
// now" is exactly the override this exists for. max_pod_size is
// still enforced as a sanity bound: nothing here should be able to
// seat more people than a pod is meant to hold.
//
// Authorization: the caller's own JWT is used to confirm they're
// signed in AND to call is_admin() (a security-definer RPC, so it
// runs as the caller and checks the admins table itself). Only
// after that check passes does this function switch to a
// service-role client to actually write the pod — regular
// authenticated users, admins included, have no direct write
// access to pods/pod_members/streaks.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { createPod } from "../_shared/createPod.ts";

const DEFAULT_MAX_POD_SIZE = 8;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface AdminFormPodBody {
  ritual_id?: unknown;
  signup_ids?: unknown;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: isAdmin, error: adminCheckError } = await callerClient.rpc("is_admin");
  if (adminCheckError || !isAdmin) {
    return new Response(JSON.stringify({ error: "not authorized" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: AdminFormPodBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ritualId = body.ritual_id;
  const signupIds = body.signup_ids;
  if (
    typeof ritualId !== "string" ||
    !Array.isArray(signupIds) ||
    signupIds.length === 0 ||
    !signupIds.every((id) => typeof id === "string")
  ) {
    return new Response(
      JSON.stringify({
        error: "ritual_id (string) and signup_ids (non-empty string[]) are required",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // The admin check above only confirms who's calling. Actually
  // seating a pod needs the service role — regular authenticated
  // users have no write access to pods/pod_members/streaks at all.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: ritual, error: ritualError } = await admin
    .from("rituals")
    .select("id, max_pod_size")
    .eq("id", ritualId)
    .maybeSingle();
  if (ritualError) {
    return new Response(JSON.stringify({ error: ritualError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!ritual) {
    return new Response(JSON.stringify({ error: "Ritual not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const maxSize = (ritual.max_pod_size as number | null) ?? DEFAULT_MAX_POD_SIZE;
  if (signupIds.length > maxSize) {
    return new Response(
      JSON.stringify({
        error: `Selected ${signupIds.length} people, but this ritual's pod size caps at ${maxSize}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { data: signups, error: signupsError } = await admin
    .from("ritual_signups")
    .select("id, user_id, ritual_id, status")
    .in("id", signupIds);
  if (signupsError) {
    return new Response(JSON.stringify({ error: signupsError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const validSignups = (signups ?? []).filter(
    (s) => s.ritual_id === ritualId && s.status === "waiting",
  );
  if (validSignups.length !== signupIds.length) {
    return new Response(
      JSON.stringify({
        error: "Every signup_id must be a 'waiting' signup for the given ritual_id",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const podId = await createPod(admin, ritualId, validSignups);
    return new Response(
      JSON.stringify({ pod_id: podId, membersSeated: validSignups.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("adminFormPod failed", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
