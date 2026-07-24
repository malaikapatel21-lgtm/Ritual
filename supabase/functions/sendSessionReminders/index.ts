// ============================================================
// sendSessionReminders — daily reminder job
//
// Deploy as a Supabase Edge Function and trigger it once a day
// (pg_cron). Finds every ritual whose session falls tomorrow,
// finds the active pods for that ritual, and pushes a reminder to
// every member. Day-of-week comparison uses UTC — schedule the
// cron trigger at a fixed UTC time so "tomorrow" lines up with the
// ritual's actual session day regardless of the server's clock.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendExpoPushToUsers } from "../_shared/expoPush.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function formatTime(startTime: string): string {
  const [hourStr, minuteStr] = startTime.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

interface RitualWithVenue {
  id: string;
  ritual_type: string;
  start_time: string;
  venues: { name: string };
}

async function sendSessionReminders() {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowDayOfWeek = tomorrow.getUTCDay();

  const { data: rituals, error: ritualsError } = await supabase
    .from("rituals")
    .select("id, ritual_type, start_time, venues(name)")
    .eq("day_of_week", tomorrowDayOfWeek);

  if (ritualsError) throw ritualsError;
  if (!rituals || rituals.length === 0) {
    return { remindersSent: 0, podsNotified: 0 };
  }

  let podsNotified = 0;
  let remindersSent = 0;

  for (const ritual of rituals as unknown as RitualWithVenue[]) {
    const { data: pods, error: podsError } = await supabase
      .from("pods")
      .select("id")
      .eq("ritual_id", ritual.id)
      .eq("status", "active");
    if (podsError) throw podsError;

    for (const pod of pods ?? []) {
      const { data: members, error: membersError } = await supabase
        .from("pod_members")
        .select("user_id")
        .eq("pod_id", pod.id);
      if (membersError) throw membersError;

      const userIds = (members ?? []).map((m) => m.user_id as string);
      if (userIds.length === 0) continue;

      await sendExpoPushToUsers(
        supabase,
        userIds,
        "Session tomorrow",
        `${ritual.ritual_type} at ${ritual.venues.name}, ${formatTime(ritual.start_time)}`,
      );

      podsNotified++;
      remindersSent += userIds.length;
    }
  }

  return { remindersSent, podsNotified };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const result = await sendSessionReminders();
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("sendSessionReminders failed", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
