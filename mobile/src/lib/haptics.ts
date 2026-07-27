import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

// expo-haptics has no implementation on web (and some Android devices lack a
// vibration motor capable of the finer feedback styles), so every call here
// is fire-and-forget: skip entirely on web, swallow any rejection elsewhere.
// Nothing in the app should ever wait on haptic feedback or fail because of it.

function run(fn: () => Promise<void>) {
  if (Platform.OS === "web") return;
  fn().catch(() => {});
}

export const hapticTap = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const hapticStep = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
export const hapticSelect = () => run(() => Haptics.selectionAsync());
export const hapticSuccess = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const hapticError = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
