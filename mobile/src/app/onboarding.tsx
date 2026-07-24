import { useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { DAY_NAMES, formatTime } from "@/lib/dates";
import { MAX_VIBE_TAGS, VIBE_TAGS, type Ritual } from "@/lib/types";

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

  return (
    <View style={styles.container}>
      {step === "city" && (
        <View style={styles.step}>
          <Text style={styles.title}>What city are you in?</Text>
          <TextInput
            style={styles.input}
            placeholder="Seattle"
            value={city}
            onChangeText={setCity}
            autoCapitalize="words"
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            style={[styles.button, (!city.trim() || loading) && styles.buttonDisabled]}
            disabled={!city.trim() || loading}
            onPress={loadRitualsForCity}
          >
            <Text style={styles.buttonText}>{loading ? "Looking…" : "Next"}</Text>
          </Pressable>
        </View>
      )}

      {step === "ritualType" && (
        <View style={styles.step}>
          <Text style={styles.title}>Pick a ritual</Text>
          <FlatList
            data={ritualTypes}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <Pressable
                style={styles.optionRow}
                onPress={() => {
                  setSelectedType(item);
                  setStep("slot");
                }}
              >
                <Text style={styles.optionText}>{item}</Text>
              </Pressable>
            )}
          />
        </View>
      )}

      {step === "slot" && (
        <View style={styles.step}>
          <Text style={styles.title}>Pick a time</Text>
          <FlatList
            data={slots}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                style={styles.optionRow}
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
        </View>
      )}

      {step === "vibeTags" && (
        <View style={styles.step}>
          <Text style={styles.title}>Pick up to {MAX_VIBE_TAGS} vibes</Text>
          <View style={styles.tagWrap}>
            {VIBE_TAGS.map((tag) => {
              const selected = vibeTags.includes(tag);
              return (
                <Pressable
                  key={tag}
                  style={[styles.tag, selected && styles.tagSelected]}
                  onPress={() => toggleVibeTag(tag)}
                >
                  <Text style={[styles.tagText, selected && styles.tagTextSelected]}>{tag}</Text>
                </Pressable>
              );
            })}
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            disabled={loading}
            onPress={finishOnboarding}
          >
            <Text style={styles.buttonText}>{loading ? "Joining…" : "I'm in"}</Text>
          </Pressable>
          <Pressable onPress={() => setStep("slot")}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64 },
  step: { flex: 1, gap: 12 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#2f6f4f",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  error: { color: "#c0392b" },
  optionRow: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    marginBottom: 8,
  },
  optionText: { fontSize: 16, textTransform: "capitalize" },
  back: { color: "#666", marginTop: 8 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  tagSelected: { backgroundColor: "#2f6f4f", borderColor: "#2f6f4f" },
  tagText: { fontSize: 14 },
  tagTextSelected: { color: "#fff" },
});
