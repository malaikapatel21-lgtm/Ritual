// ============================================================
// expoPush — shared helper for sending Expo push notifications
// from Edge Functions. Imported by matchPods, sendSessionReminders,
// and sendPush. Never throws — a push failure should never take
// down pod matching, reminders, or a check-in.
// ============================================================

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100; // Expo's documented max messages per request

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

async function sendBatch(batch: ExpoPushMessage[]): Promise<void> {
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batch),
    });
    if (!response.ok) {
      console.error("Expo push batch failed", response.status, await response.text());
    }
  } catch (error) {
    console.error("Expo push batch errored", error);
  }
}

/** Sends a batch of push messages. Silently drops anything that isn't a valid Expo push token. */
export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  const valid = messages.filter((m) => m.to?.startsWith("ExponentPushToken"));
  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    await sendBatch(valid.slice(i, i + BATCH_SIZE));
  }
}

/** Looks up push tokens for a set of users and sends the same title/body to all of them. */
export async function sendExpoPushToUsers(
  supabase: SupabaseClient,
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (userIds.length === 0) return;

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("push_token")
    .in("id", userIds)
    .not("push_token", "is", null);

  if (error) {
    console.error("Failed to load push tokens", error);
    return;
  }

  const messages = (profiles ?? [])
    .map((p) => p.push_token as string | null)
    .filter((token): token is string => !!token)
    .map((token) => ({ to: token, title, body, data }));

  await sendExpoPush(messages);
}
