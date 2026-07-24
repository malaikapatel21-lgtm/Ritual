import { useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInRight, FadeIn, ZoomIn } from "react-native-reanimated";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { DAY_NAMES, formatTime } from "@/lib/dates";
import { MAX_VIBE_TAGS, VIBE_TAGS, type Ritual } from "@/lib/types";
import { Screen } from "@/components/Screen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PosterCard } from "@/components/PosterCard";
import { ConfettiBurst } from "@/components/ConfettiBurst";
import { accentForRitual, colors, fonts } from "@/lib/theme";
import { hapticStep, hapticSuccess } from "@/lib/haptics";

const OFFSET = 4;

type Step = "city" | "ritualType" | "slot" | "vibeTags";
const STEPS: Step[] = ["city", "ritualType", "slot", "vibeTags"];

export default function Onboarding() {
  const { session, markOnboardingComplete } = useAuth();
  const [step, setStep] = useState<Step>("city");
  const [joined, setJoined] = useState(false);

  const [city, setCity] = useState("");
  const [rituals, setRituals] = useState<Ritual[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedRitualId, setSelectedRitualId] = useState<string | null>(null);
  const [vibeTags, setVibeTags] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goToStep(next: Step) {
    hapticStep();
    setStep(next);
  }

  async function loadRitualsForCity() {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("rituals")
      .select("id, ritual_type, day_of_week, start_time, min_pod_size, max_pod_size, venues!inner(id, name, city, neighborhood)")
      .ilike("venues.city", city.trim());
    setLoading(false);

    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    if (!data || data.length === 0) {
      setError(`No rituals set up in ${city.trim()} yet — try another city.`);
      return;
    }
    setRituals(data as unknown as Ritual[]);
    goToStep("ritualType");
  }

  function toggleVibeTag(tag: string) {
    setVibeTags((current) => {
      if (current.includes(tag)) return current.filter((t) => t !== tag);
      if (current.length >= MAX_VIBE_TAGS) return current;
      return [...current, tag];
    });
  }

  async function finishOnboarding() {
    if (!session || !selectedRitualId) return;
    setLoading(true);
    setError(null);

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({ id: session.user.id, city: city.trim(), vibe_tags: vibeTags }, { onConflict: "id" });

    if (profileError) {
      setLoading(false);
      setError(profileError.message);
      return;
    }

    const { error: signupError } = await supabase
      .from("ritual_signups")
      .insert({ ritual_id: selectedRitualId, user_id: session.user.id });

    setLoading(false);

    if (signupError && signupError.code !== "23505") {
      setError(signupError.message);
      return;
    }

    hapticSuccess();
    setJoined(true);
    setTimeout(() => {
      markOnboardingComplete();
      router.replace("/");
    }, 1500);
  }

  const ritualTypes = [...new Set(rituals.map((r) => r.ritual_type))];
  const slots = rituals.filter((r) => r.ritual_type === selectedType);
  const accent = accentForRitual(selectedType ?? undefined);

  if (joined) {
    return (
      <Screen accent={accent} style={styles.center}>
        <ConfettiBurst />
        <View style={styles.joinedWrap}>
          <View style={styles.joinedShadow} />
          <Animated.View entering={ZoomIn.duration(450)} style={styles.joinedCircle}>
            <Text style={styles.joinedMark}>✓</Text>
          </Animated.View>
        </View>
        <Animated.Text entering={FadeIn.delay(200).duration(400)} style={styles.joinedTitle}>
          ON THE LIST
        </Animated.Text>
        <Animated.Text entering={FadeIn.delay(350).duration(400)} style={styles.joinedSubtitle}>
          We'll notify you the moment your pod forms.
        </Animated.Text>
      </Screen>
    );
  }

  return (
    <Screen accent={accent} style={styles.container}>
      <View style={styles.progressRow}>
        {STEPS.map((s, i) => (
          <View
            key={s}
            style={[
              styles.progressTick,
              STEPS.indexOf(step) >= i && { backgroundColor: accent, borderColor: colors.ink },
            ]}
          />
        ))}
      </View>

      {step === "city" && (
        <Animated.View key="city" entering={FadeInRight.duration(400)} style={styles.step}>
          <Text style={styles.title}>WHAT CITY ARE YOU IN?</Text>
          <TextInput
            style={styles.input}
            placeholder="SEATTLE"
            placeholderTextColor={colors.muted}
            value={city}
            onChangeText={setCity}
            autoCapitalize="characters"
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <PrimaryButton
            title={loading ? "Looking…" : "Next"}
            onPress={loadRitualsForCity}
            disabled={!city.trim() || loading}
          />
        </Animated.View>
      )}

      {step === "ritualType" && (
        <Animated.View key="ritualType" entering={FadeInRight.duration(400)} style={styles.step}>
          <Text style={styles.title}>PICK A RITUAL</Text>
          <FlatList
            data={ritualTypes}
            keyExtractor={(item) => item}
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInRight.delay(index * 60).duration(350)}>
                <Pressable
                  onPress={() => {
                    setSelectedType(item);
                    goToStep("slot");
                  }}
                >
                  <PosterCard style={styles.optionCard} borderColor={accentForRitual(item)}>
                    <Text style={[styles.optionText, { color: accentForRitual(item) }]}>
                      {item.toUpperCase()}
                    </Text>
                  </PosterCard>
                </Pressable>
              </Animated.View>
            )}
          />
        </Animated.View>
      )}

      {step === "slot" && (
        <Animated.View key="slot" entering={FadeInRight.duration(400)} style={styles.step}>
          <Text style={styles.title}>PICK A TIME</Text>
          <FlatList
            data={slots}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInRight.delay(index * 60).duration(350)}>
                <Pressable
                  onPress={() => {
                    setSelectedRitualId(item.id);
                    goToStep("vibeTags");
                  }}
                >
                  <PosterCard style={styles.optionCard} borderColor={accent}>
                    <Text style={styles.optionText}>
                      {item.venues.name} · {DAY_NAMES[item.day_of_week]}s at {formatTime(item.start_time)}
                    </Text>
                  </PosterCard>
                </Pressable>
              </Animated.View>
            )}
          />
          <Pressable onPress={() => goToStep("ritualType")}>
            <Text style={styles.back}>← BACK</Text>
          </Pressable>
        </Animated.View>
      )}

      {step === "vibeTags" && (
        <Animated.View key="vibeTags" entering={FadeInRight.duration(400)} style={styles.step}>
          <Text style={styles.title}>PICK UP TO {MAX_VIBE_TAGS} VIBES</Text>
          <View style={styles.tagWrap}>
            {VIBE_TAGS.map((tag) => {
              const selected = vibeTags.includes(tag);
              return (
                <Pressable
                  key={tag}
                  style={[styles.tag, selected && { backgroundColor: accent, borderColor: colors.ink }]}
                  onPress={() => toggleVibeTag(tag)}
                >
                  <Text style={[styles.tagText, selected && styles.tagTextSelected]}>
                    {tag.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <PrimaryButton title={loading ? "Joining…" : "I'm in"} onPress={finishOnboarding} disabled={loading} />
          <Pressable onPress={() => goToStep("slot")}>
            <Text style={styles.back}>← BACK</Text>
          </Pressable>
        </Animated.View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 20 },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  progressRow: { flexDirection: "row", gap: 8, marginBottom: 28 },
  progressTick: {
    width: 22,
    height: 10,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: colors.muted,
    backgroundColor: "transparent",
  },
  step: { flex: 1, gap: 14 },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.ink, marginBottom: 6, letterSpacing: 0.5 },
  input: {
    borderWidth: 2.5,
    borderColor: colors.ink,
    borderRadius: 6,
    padding: 15,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  error: { fontFamily: fonts.bodyMedium, color: colors.rust },
  optionCard: { marginBottom: 12 },
  optionText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    textTransform: "uppercase",
    color: colors.ink,
    padding: 16,
  },
  back: { fontFamily: fonts.labelSemibold, color: colors.muted, marginTop: 8, letterSpacing: 0.5 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tag: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 4,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
  },
  tagText: { fontFamily: fonts.labelSemibold, fontSize: 14, color: colors.ink, letterSpacing: 0.5 },
  tagTextSelected: { color: colors.ink },
  joinedWrap: { width: 108, height: 108, alignItems: "center", justifyContent: "center" },
  joinedShadow: {
    position: "absolute",
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: colors.ink,
    transform: [{ translateX: OFFSET }, { translateY: OFFSET }],
  },
  joinedCircle: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.pine,
    alignItems: "center",
    justifyContent: "center",
  },
  joinedMark: { fontSize: 48, color: colors.paper, fontWeight: "700" },
  joinedTitle: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, marginTop: 22, letterSpacing: 0.5 },
  joinedSubtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.muted,
    marginTop: 8,
    textAlign: "center",
  },
});
