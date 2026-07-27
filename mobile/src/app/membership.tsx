import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { usePodMembership } from "@/lib/usePodMembership";
import type { Payment } from "@/lib/types";
import { Screen } from "@/components/Screen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { accentForRitual, colors, fonts } from "@/lib/theme";
import { hapticError, hapticSuccess } from "@/lib/haptics";

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}/mo`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function Membership() {
  const { loading: membershipLoading, status, ritual } = usePodMembership();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loadingPayment, setLoadingPayment] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accent = accentForRitual(ritual?.ritual_type);

  const loadPayment = useCallback(async () => {
    if (!ritual) return;
    setLoadingPayment(true);
    const { data } = await supabase
      .from("payments")
      .select("ritual_id, status, current_period_end")
      .eq("ritual_id", ritual.id)
      .maybeSingle();
    setPayment(data ?? null);
    setLoadingPayment(false);
  }, [ritual]);

  useEffect(() => {
    loadPayment();
  }, [loadPayment]);

  async function subscribe() {
    if (!ritual) return;
    setError(null);
    setSubscribing(true);

    const { data, error: invokeError } = await supabase.functions.invoke("createCheckoutSession", {
      body: { ritual_id: ritual.id },
    });

    if (invokeError || !data?.url) {
      setSubscribing(false);
      hapticError();
      setError(invokeError?.message ?? "Couldn't start checkout — try again.");
      return;
    }

    const redirectUrl = Linking.createURL("membership");
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
    setSubscribing(false);

    if (result.type === "success") {
      hapticSuccess();
    }
    await loadPayment();
  }

  if (membershipLoading || loadingPayment) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.rust} />
      </Screen>
    );
  }

  if (status !== "matched" || !ritual) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.subtitle}>Membership opens once you're matched into a pod.</Text>
      </Screen>
    );
  }

  return (
    <Screen accent={accent} style={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={[styles.back, { color: accent }]}>← BACK</Text>
      </Pressable>

      <Text style={styles.title}>MEMBERSHIP</Text>
      <Text style={styles.subtitle}>{ritual.ritual_type.toUpperCase()} AT {ritual.venues.name.toUpperCase()}</Text>

      {!ritual.price_cents && (
        <View style={styles.box}>
          <Text style={styles.body}>
            This pod isn't a paid membership yet — keep showing up, and if the streak sticks, that
            might change.
          </Text>
        </View>
      )}

      {ritual.price_cents && payment?.status === "active" && (
        <View style={styles.box}>
          <View style={[styles.statusPill, { borderColor: colors.pine }]}>
            <Text style={[styles.statusPillText, { color: colors.pine }]}>ACTIVE</Text>
          </View>
          <Text style={styles.body}>
            {formatPrice(ritual.price_cents)} — renews{" "}
            {payment.current_period_end ? formatDate(payment.current_period_end) : "soon"}.
          </Text>
        </View>
      )}

      {ritual.price_cents && payment?.status === "past_due" && (
        <View style={styles.box}>
          <View style={[styles.statusPill, { borderColor: colors.rust }]}>
            <Text style={[styles.statusPillText, { color: colors.rust }]}>PAST DUE</Text>
          </View>
          <Text style={styles.body}>Your last payment didn't go through — update it to keep your spot.</Text>
          <PrimaryButton
            title={subscribing ? "Opening…" : "Update payment"}
            onPress={subscribe}
            disabled={subscribing}
          />
        </View>
      )}

      {ritual.price_cents && (!payment || payment.status === "incomplete" || payment.status === "canceled") && (
        <View style={styles.box}>
          <Text style={styles.body}>
            {formatPrice(ritual.price_cents)} keeps this pod's slot reserved and its ritual running.
          </Text>
          {error && <Text style={styles.error}>{error}</Text>}
          <PrimaryButton
            title={subscribing ? "Opening…" : "Subscribe"}
            onPress={subscribe}
            disabled={subscribing}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 20, gap: 14 },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  back: { fontFamily: fonts.labelSemibold, fontSize: 15, letterSpacing: 0.5 },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, marginTop: 10, letterSpacing: 0.5 },
  subtitle: { fontFamily: fonts.label, fontSize: 14, color: colors.muted, letterSpacing: 0.5 },
  box: { gap: 12, marginTop: 16 },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.ink, lineHeight: 21 },
  error: { fontFamily: fonts.bodyMedium, color: colors.rust },
  statusPill: {
    alignSelf: "flex-start",
    borderWidth: 2,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  statusPillText: { fontFamily: fonts.labelSemibold, fontSize: 12, letterSpacing: 1 },
});
