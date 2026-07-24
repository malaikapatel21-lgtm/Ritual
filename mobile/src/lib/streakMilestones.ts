import { supabase } from "@/lib/supabase";

/** 3 is an early encouragement; every 5 after that is a bigger milestone. */
export function isStreakMilestone(streak: number): boolean {
  return streak === 3 || (streak > 0 && streak % 5 === 0);
}

/** Fire-and-forget: pushes a celebratory notification to the caller's own
 * devices via the sendPush edge function. Never throws — a failed push
 * should never surface as an error on a successful check-in. */
export async function notifyStreakMilestone(streak: number): Promise<void> {
  try {
    await supabase.functions.invoke("sendPush", {
      body: {
        title: `${streak}-week streak! 🔥`,
        body: `You've shown up ${streak} weeks in a row with your pod. Keep it going.`,
      },
    });
  } catch (error) {
    console.warn("Streak milestone push failed", error);
  }
}
