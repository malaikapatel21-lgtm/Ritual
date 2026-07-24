import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown, FadeInUp, FadeInRight, FadeIn, ZoomIn } from "react-native-reanimated";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { usePodMembership } from "@/lib/usePodMembership";
import { DAY_NAMES, formatTime, isSessionDay, nextSessionDate, toISODate } from "@/lib/dates";
import { isStreakMilestone, notifyStreakMilestone } from "@/lib/streakMilestones";
import type { SignupStatus } from "@/lib/types";
import { Screen } from "@/components/Screen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StreakBadge } from "@/components/StreakBadge";
import { CheckInScanner } from "@/components/CheckInScanner";
import { ConfettiBurst } from "@/components/ConfettiBurst";
import { accentForRitual, colors, fonts } from "@/lib/theme";
import { hapticError, hapticSuccess } from "@/lib/haptics";

export default function PodHome() {
  const { session, signOut } = useAuth();
  const { loading, status, ritual, podId, members, streak, checkedInToday, refresh } = usePodMembership();
  const [checkingIn, setCheckingIn] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [justMatched, setJustMatched] = useState(false);
  const previousStatus = useRef<SignupStatus | null>(null);

  // Detect a live waiting -> matched transition (e.g. the weekly matcher ran,
  // or an admin manually formed a pod, while this screen happened to be
  // open) and celebrate it — but only that transition, never a pod that was
  // already formed before this screen ever mounted.
  useEffect(() => {
    const previous = previousStatus.current;
    previousStatus.current = status;
    if (previous === "waiting" && status === "matched") {
      hapticSuccess();
      setJustMatched(true);
      const timer = setTimeout(() => setJustMatched(false), 2400);
      return () => clearTimeout(timer);
    }
  }, [status]);

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
    if (error) {
      hapticError();
      return;
    }
    hapticSuccess();
    const freshStreak = await refresh();
    const newStreak = freshStreak?.current_streak ?? 0;
    if (newStreak > previousStreak && isStreakMilestone(newStreak)) {
      await notifyStreakMilestone(newStreak);
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 1200);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
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

  if (justMatched) {
    return (
      <Screen accent={accent} style={styles.center}>
        <ConfettiBurst />
        <Animated.View entering={ZoomIn.duration(450)} style={[styles.joinedCircle, { backgroundColor: accent }]}>
          <Text style={styles.joinedMark}>✓</Text>
        </Animated.View>
        <Animated.Text entering={FadeIn.delay(200).duration(400)} style={styles.joinedTitle}>
          You're in a pod!
        </Animated.Text>
        <Animated.Text entering={FadeIn.delay(350).duration(400)} style={styles.joinedSubtitle}>
          {ritual.ritual_type} at {ritual.venues.name} — say hi to your group.
        </Animated.Text>
      </Screen>
    );
  }

  if (status === "waiting") {
    return (
      <Screen accent={accent} style={styles.container}>
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Animated.View entering={FadeInDown.duration(600)}>
            <Text style={styles.title}>You're on the list</Text>
            <Text style={styles.subtitle}>
              {ritual.ritual_type} at {ritual.venues.name} · {DAY_NAMES[ritual.day_of_week]}s at{" "}
              {formatTime(ritual.start_time)}
            </Text>
            <Text style={styles.body}>
              We match pods weekly. Once enough people sign up for this slot, you'll see your pod here.
              Pull down to check.
            </Text>
          </Animated.View>
          <Pressable onPress={signOut}>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen accent={accent} style={styles.container}>
      <FlatList
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
        data={members}
        keyExtractor={(item) => item.user_id}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInRight.delay(index * 70).duration(350)}>
            <Text style={styles.member}>
              {item.user_id === session?.user.id ? "You" : item.full_name ?? "A member"}
            </Text>
          </Animated.View>
        )}
        ListHeaderComponent={
          <>
            <Animated.View entering={FadeInDown.duration(600)}>
              <Text style={[styles.title, { color: accent }]}>{ritual.ritual_type}</Text>
              <Text style={styles.subtitle}>
                {ritual.venues.name} · {DAY_NAMES[ritual.day_of_week]}s at {formatTime(ritual.start_time)}
              </Text>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(100).duration(600)} style={{ alignItems: "center" }}>
              {celebrating && <ConfettiBurst count={20} />}
              <StreakBadge streak={streak?.current_streak ?? 0} celebrate={celebrating} />
            </Animated.View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitleInline}>Your pod</Text>
              <Pressable onPress={() => router.push("/chat")}>
                <Text style={[styles.chatLink, { color: accent }]}>Chat →</Text>
              </Pressable>
            </View>
          </>
        }
        ListFooterComponent={
          <View>
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
              onPress={() => setShowScanner(true)}
              disabled={!sessionIsToday || checkedInToday || checkingIn}
              style={styles.checkInButton}
            />

            <Pressable onPress={signOut}>
              <Text style={styles.signOut}>Sign out</Text>
            </Pressable>
          </View>
        }
      />

      {showScanner && (
        <CheckInScanner
          expectedCode={ritual.check_in_code}
          onVerified={() => {
            setShowScanner(false);
            checkIn();
          }}
          onCancel={() => setShowScanner(false)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 20 },
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
  signOut: { color: colors.muted, marginTop: 20, textAlign: "center", paddingBottom: 24 },
  joinedCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  joinedMark: { fontSize: 46, color: colors.surface, fontWeight: "700" },
  joinedTitle: { fontFamily: fonts.display, fontSize: 28, color: colors.ink, marginTop: 22, textAlign: "center" },
  joinedSubtitle: {
    fontSize: 15,
    color: colors.muted,
    marginTop: 8,
    textAlign: "center",
    textTransform: "capitalize",
    paddingHorizontal: 24,
  },
});
