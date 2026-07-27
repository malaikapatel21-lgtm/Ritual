import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Requests permission, gets an Expo push token, and saves it to the user's
 * profile. Safe to call every time the app opens with a session — it's a
 * no-op past the first successful run except for the (cheap) permission
 * check. Requires an EAS projectId in app.json (`extra.eas.projectId`) —
 * without one, this logs a warning and returns without registering. */
export async function registerPushToken(userId: string): Promise<void> {
  if (Platform.OS === "web") return; // Expo push tokens are iOS/Android only

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn(
      "No EAS projectId configured (app.json extra.eas.projectId) — skipping push token registration. Run `eas init` to get one."
    );
    return;
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  await supabase.from("profiles").update({ push_token: token }).eq("id", userId);
}
