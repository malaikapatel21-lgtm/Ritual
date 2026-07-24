import { useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { usePodMembership } from "@/lib/usePodMembership";
import { DAY_NAMES, formatTime, isSessionDay, nextSessionDate, toISODate } from "@/lib/dates";
import { isStreakMilestone, notifyStreakMilestone } from "@/lib/streakMilestones";
import { Screen } from "@/components/Screen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StreakBadge } from "@/components/StreakBadge";
import { accentForRitual, colors, fonts } from "@/lib/theme";

export default function PodHome() {
  const { session, signOut } = useAuth();
  const { loading, status, ritual, podId, members, streak, checkedInToday, refresh } = usePodMembership();
  const [checkingIn, setCheckingIn] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  async function checkIn() {
    if (!session || !podId) return;
    setCheckingIn(true);
    const previousStreak = streak?.current_streak ?? 0;
    const { error } = await supabase.rpc("handle_checkin", {
      p_pod_id: podId,
      p_user_id: session.user.id,
      p_session_date: toISODate(new Date()),
    });
    setCheckingIn(false);
    if (!error) {
      const freshStreak = await refresh();
      const newStreak = freshStreak?.current_streak ?? 0;
      if (newStreak > previousStreak && isStreakMilestone(newStreak)) {
        await notifyStreakMilestone(newStreak);
        setCelebrating(true);
        setTimeout(() => setCelebrating(false), 900);
      }
    }
  }

  if (loading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.berry} />
      </Screen>
    );
  }

  if (!status || !ritual) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.title}>No ritual yet</Text>
        <Text style={styles.subtitle}>Something went wrong — try signing in again.</Text>
      </Screen>
    );
  }

  const accent = accentForRitual(ritual.ritual_type);
  const sessionIsToday = isSessionDay(ritual.day_of_week);
  const nextDate = nextSessionDate(ritual.day_of_week);

  if (status === "waiting") {
    return (
      <Screen accent={accent} style={styles.container}>
        <Animated.View entering={FadeInDown.duration(600)}>
          <Text style={styles.title}>You're on the list</Text>
          <Text style={styles.subtitle}>
            {ritual.ritual_type} at {ritual.venues.name} · {DAY_NAMES[ritual.day_of_week]}s at{" "}
            {formatTime(ritual.start_time)}
          </Text>
          <Text style={styles.body}>
            We match pods weekly. Once enough people sign up for this slot, you'll see your pod here.
          </Text>
        </Animated.View>
        <Pressable onPress={signOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen accent={accent} style={styles.container}>
      <Animated.View entering={FadeInDown.duration(600)}>
        <Text style={[styles.title, { color: accent }]}>{ritual.ritual_type}</Text>
        <Text style={styles.subtitle}>
          {ritual.venues.name} · {DAY_NAMES[ritual.day_of_week]}s at {formatTime(ritual.start_time)}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(100).duration(600)}>
        <StreakBadge streak={streak?.current_streak ?? 0} celebrate={celebrating} />
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(200).duration(600)}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleInline}>Your pod</Text>
          <Pressable onPress={() => router.push("/chat")}>
            <Text style={[styles.chatLink, { color: accent }]}>Chat →</Text>
          </Pressable>
        </View>
        <FlatList
          data={members}
          keyExtractor={(item) => item.user_id}
          renderItem={({ item }) => (
            <Text style={styles.member}>
              {item.user_id === session?.user.id ? "You" : item.full_name ?? "A member"}
            </Text>
          )}
        />

        <Text style={styles.sectionTitle}>
          Next session: {sessionIsToday ? "Today" : DAY_NAMES[nextDate.getDay()]}
        </Text>

        <PrimaryButton
          title={
            checkedInToday
              ? "You're checked in ✓"
              : sessionIsToday
                ? checkingIn
                  ? "Checking in…"
                  : "I'm here"
                : "Check-in opens on session day"
          }
          onPress={checkIn}
          disabled={!sessionIsToday || checkedInToday || checkingIn}
          style={styles.checkInButton}
        />

        <Pressable onPress={signOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 8 },
  center: { alignItems: "center", justifyContent: "center", gap: 8 },
  title: { fontFamily: fonts.display, fontSize: 30, color: colors.ink, textTransform: "capitalize" },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: 4 },
  body: { fontSize: 15, color: colors.ink, marginTop: 12 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: colors.ink, marginTop: 20, marginBottom: 8 },
  sectionTitleInline: { fontSize: 16, fontWeight: "600", color: colors.ink },
  chatLink: { fontSize: 15, fontWeight: "700" },
  member: { fontSize: 15, paddingVertical: 4, color: colors.ink },
  checkInButton: { marginTop: 12 },
  signOut: { color: colors.muted, marginTop: 20, textAlign: "center" },
});
