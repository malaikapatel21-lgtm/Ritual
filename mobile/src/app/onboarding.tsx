import { useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInRight } from "react-native-reanimated";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { DAY_NAMES, formatTime } from "@/lib/dates";
import { MAX_VIBE_TAGS, VIBE_TAGS, type Ritual } from "@/lib/types";
import { Screen } from "@/components/Screen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { accentForRitual, colors, fonts } from "@/lib/theme";

type Step = "city" | "ritualType" | "slot" | "vibeTags";

export default function Onboarding() {
  const { session, markOnboardingComplete } = useAuth();
  const [step, setStep] = useState<Step>("city");

  const [city, setCity] = useState("");
  const [rituals, setRituals] = useState<Ritual[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedRitualId, setSelectedRitualId] = useState<string | null>(null);
  const [vibeTags, setVibeTags] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setStep("ritualType");
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

    markOnboardingComplete();
    router.replace("/");
  }

  const ritualTypes = [...new Set(rituals.map((r) => r.ritual_type))];
  const slots = rituals.filter((r) => r.ritual_type === selectedType);
  const accent = accentForRitual(selectedType ?? undefined);

  return (
    <Screen accent={accent} style={styles.container}>
      {step === "city" && (
        <Animated.View key="city" entering={FadeInRight.duration(400)} style={styles.step}>
          <Text style={styles.title}>What city are you in?</Text>
          <TextInput
            style={styles.input}
            placeholder="Seattle"
            placeholderTextColor={colors.muted}
            value={city}
            onChangeText={setCity}
            autoCapitalize="words"
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
          <Text style={styles.title}>Pick a ritual</Text>
          <FlatList
            data={ritualTypes}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.optionRow, { borderColor: accentForRitual(item) }]}
                onPress={() => {
                  setSelectedType(item);
                  setStep("slot");
                }}
              >
                <Text style={[styles.optionText, { color: accentForRitual(item) }]}>{item}</Text>
              </Pressable>
            )}
          />
        </Animated.View>
      )}

      {step === "slot" && (
        <Animated.View key="slot" entering={FadeInRight.duration(400)} style={styles.step}>
          <Text style={styles.title}>Pick a time</Text>
          <FlatList
            data={slots}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.optionRow, { borderColor: accent }]}
                onPress={() => {
                  setSelectedRitualId(item.id);
                  setStep("vibeTags");
                }}
              >
                <Text style={styles.optionText}>
                  {item.venues.name} · {DAY_NAMES[item.day_of_week]}s at {formatTime(item.start_time)}
                </Text>
              </Pressable>
            )}
          />
          <Pressable onPress={() => setStep("ritualType")}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
        </Animated.View>
      )}

      {step === "vibeTags" && (
        <Animated.View key="vibeTags" entering={FadeInRight.duration(400)} style={styles.step}>
          <Text style={styles.title}>Pick up to {MAX_VIBE_TAGS} vibes</Text>
          <View style={styles.tagWrap}>
            {VIBE_TAGS.map((tag) => {
              const selected = vibeTags.includes(tag);
              return (
                <Pressable
                  key={tag}
                  style={[styles.tag, selected && { backgroundColor: accent, borderColor: accent }]}
                  onPress={() => toggleVibeTag(tag)}
                >
                  <Text style={[styles.tagText, selected && styles.tagTextSelected]}>{tag}</Text>
                </Pressable>
              );
            })}
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <PrimaryButton title={loading ? "Joining…" : "I'm in"} onPress={finishOnboarding} disabled={loading} />
          <Pressable onPress={() => setStep("slot")}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
        </Animated.View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 72 },
  step: { flex: 1, gap: 14 },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.ink, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 15,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  error: { color: colors.berry },
  optionRow: {
    padding: 16,
    borderWidth: 1.5,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  optionText: { fontSize: 16, textTransform: "capitalize", color: colors.ink, fontWeight: "600" },
  back: { color: colors.muted, marginTop: 8 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
  },
  tagText: { fontSize: 14, color: colors.ink },
  tagTextSelected: { color: colors.surface, fontWeight: "600" },
});
