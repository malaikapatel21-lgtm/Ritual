// ============================================================
// sendPush — self-serve push notification endpoint
//
// Called by the mobile app itself (e.g. after a streak-milestone
// check-in) to notify the SIGNED-IN USER'S OWN devices. Deliberately
// narrow: it never accepts a target user_id from the request body —
// the target is always whoever the caller's JWT identifies, so a
// client can only ever push-notify itself, never another user.
// Broadcast notifications (pod formed, session reminder) are sent
// server-side from matchPods / sendSessionReminders instead, which
// run under the service role and don't go through this endpoint.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendExpoPush } from "../_shared/expoPush.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

interface SendPushBody {
  title?: unknown;
  body?: unknown;
  data?: Record<string, unknown>;
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

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: SendPushBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (typeof body.title !== "string" || typeof body.body !== "string") {
    return new Response(JSON.stringify({ error: "title and body are required strings" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("push_token")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    return new Response(JSON.stringify({ error: profileError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (profile?.push_token) {
    await sendExpoPush([
      { to: profile.push_token, title: body.title, body: body.body, data: body.data },
    ]);
  }

  return new Response(JSON.stringify({ sent: !!profile?.push_token }), {
    headers: { "Content-Type": "application/json" },
  });
});
