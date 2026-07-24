import { useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { usePodMembership } from "@/lib/usePodMembership";
import { DAY_NAMES, formatTime, isSessionDay, nextSessionDate, toISODate } from "@/lib/dates";

export default function PodHome() {
  const { session, signOut } = useAuth();
  const { loading, status, ritual, podId, members, streak, checkedInToday, refresh } = usePodMembership();
  const [checkingIn, setCheckingIn] = useState(false);

  async function checkIn() {
    if (!session || !podId) return;
    setCheckingIn(true);
    const { error } = await supabase.rpc("handle_checkin", {
      p_pod_id: podId,
      p_user_id: session.user.id,
      p_session_date: toISODate(new Date()),
    });
    setCheckingIn(false);
    if (!error) {
      await refresh();
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!status || !ritual) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>No ritual yet</Text>
        <Text style={styles.subtitle}>Something went wrong — try signing in again.</Text>
      </View>
    );
  }

  const sessionIsToday = isSessionDay(ritual.day_of_week);
  const nextDate = nextSessionDate(ritual.day_of_week);

  if (status === "waiting") {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>You're on the list</Text>
        <Text style={styles.subtitle}>
          {ritual.ritual_type} at {ritual.venues.name} · {DAY_NAMES[ritual.day_of_week]}s at{" "}
          {formatTime(ritual.start_time)}
        </Text>
        <Text style={styles.body}>
          We match pods weekly. Once enough people sign up for this slot, you'll see your pod here.
        </Text>
        <Pressable onPress={signOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{ritual.ritual_type}</Text>
      <Text style={styles.subtitle}>
        {ritual.venues.name} · {DAY_NAMES[ritual.day_of_week]}s at {formatTime(ritual.start_time)}
      </Text>

      <View style={styles.streakBadge}>
        <Text style={styles.streakNumber}>{streak?.current_streak ?? 0}</Text>
        <Text style={styles.streakLabel}>week streak</Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitleInline}>Your pod</Text>
        <Pressable onPress={() => router.push("/chat")}>
          <Text style={styles.chatLink}>Chat →</Text>
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

      <Pressable
        style={[
          styles.button,
          (!sessionIsToday || checkedInToday || checkingIn) && styles.buttonDisabled,
        ]}
        disabled={!sessionIsToday || checkedInToday || checkingIn}
        onPress={checkIn}
      >
        <Text style={styles.buttonText}>
          {checkedInToday
            ? "You're checked in ✓"
            : sessionIsToday
              ? checkingIn
                ? "Checking in…"
                : "I'm here"
              : "Check-in opens on session day"}
        </Text>
      </Pressable>

      <Pressable onPress={signOut}>
        <Text style={styles.signOut}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  title: { fontSize: 26, fontWeight: "700", textTransform: "capitalize" },
  subtitle: { fontSize: 15, color: "#666" },
  body: { fontSize: 15, color: "#333", marginTop: 12 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginTop: 20, marginBottom: 8 },
  sectionTitleInline: { fontSize: 16, fontWeight: "600" },
  chatLink: { fontSize: 15, fontWeight: "600", color: "#2f6f4f" },
  member: { fontSize: 15, paddingVertical: 4 },
  streakBadge: { alignItems: "center", marginTop: 20 },
  streakNumber: { fontSize: 40, fontWeight: "800", color: "#2f6f4f" },
  streakLabel: { fontSize: 13, color: "#666" },
  button: {
    backgroundColor: "#2f6f4f",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 12,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  signOut: { color: "#666", marginTop: 20, textAlign: "center" },
});
