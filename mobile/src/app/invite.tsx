import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, Share, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { Screen } from "@/components/Screen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { colors, fonts } from "@/lib/theme";
import { hapticSuccess } from "@/lib/haptics";

export default function Invite() {
  const { session } = useAuth();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const [{ data: profile }, { count }] = await Promise.all([
      supabase.from("profiles").select("referral_code").eq("id", session.user.id).maybeSingle(),
      supabase.from("referrals").select("id", { count: "exact", head: true }).eq("referrer_id", session.user.id),
    ]);
    setReferralCode((profile?.referral_code as string | null) ?? null);
    setReferralCount(count ?? 0);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  async function share() {
    if (!referralCode) return;
    await Share.share({
      message: `Join me on Ritual — the accountability pod app. Use my code ${referralCode} when you sign up: ritualpods://invite?code=${referralCode}`,
    });
    hapticSuccess();
  }

  if (loading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.rust} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← BACK</Text>
      </Pressable>

      <Text style={styles.title}>INVITE FRIENDS</Text>
      <Text style={styles.subtitle}>Share your code — when a friend subscribes, you get $10 off.</Text>

      <View style={styles.codeBox}>
        <View style={styles.codeShadow} />
        <View style={styles.codeInner}>
          <Text style={styles.codeLabel}>YOUR CODE</Text>
          <Text style={styles.code}>{referralCode ?? "—"}</Text>
        </View>
      </View>

      {referralCount > 0 && (
        <View style={styles.statRow}>
          <Text style={styles.statNumber}>{referralCount}</Text>
          <Text style={styles.statLabel}>{referralCount === 1 ? "FRIEND JOINED" : "FRIENDS JOINED"}</Text>
        </View>
      )}

      <PrimaryButton title="Share my code" onPress={share} disabled={!referralCode} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 20, gap: 14 },
  center: { alignItems: "center", justifyContent: "center" },
  back: { fontFamily: fonts.labelSemibold, fontSize: 15, color: colors.rust, letterSpacing: 0.5 },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, marginTop: 10, letterSpacing: 0.5 },
  subtitle: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, lineHeight: 21 },
  codeBox: { width: "100%", alignItems: "center", justifyContent: "center", marginTop: 16 },
  codeShadow: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: 6,
    backgroundColor: colors.ink,
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
  codeInner: {
    width: "100%",
    borderWidth: 2.5,
    borderColor: colors.ink,
    borderRadius: 6,
    paddingVertical: 24,
    paddingHorizontal: 20,
    backgroundColor: colors.mustard,
    alignItems: "center",
    gap: 6,
  },
  codeLabel: { fontFamily: fonts.label, fontSize: 12, color: colors.ink, letterSpacing: 1.5 },
  code: { fontFamily: fonts.display, fontSize: 36, color: colors.ink, letterSpacing: 4 },
  statRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: 2,
    borderTopColor: colors.ink,
  },
  statNumber: { fontFamily: fonts.display, fontSize: 28, color: colors.pine },
  statLabel: { fontFamily: fonts.label, fontSize: 14, color: colors.muted, letterSpacing: 0.5 },
});
