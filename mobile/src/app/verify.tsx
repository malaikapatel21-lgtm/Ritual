import { useState } from "react";
import { Text, TextInput, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { supabase } from "@/lib/supabase";
import { Screen } from "@/components/Screen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { colors, fonts } from "@/lib/theme";

export default function Verify() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setError(null);
    setVerifying(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setVerifying(false);

    if (verifyError) {
      setError(verifyError.message);
    }
    // On success, AuthProvider's onAuthStateChange picks up the new session
    // and the root layout routes away from this screen automatically.
  }

  return (
    <Screen accent={colors.gold} style={styles.container}>
      <Animated.View entering={FadeInDown.duration(600)}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>Enter the code we sent to {email}.</Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(150).duration(600)} style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="123456"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={setCode}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <PrimaryButton
          title={verifying ? "Verifying…" : "Verify"}
          onPress={verify}
          disabled={verifying || code.length < 6}
          variant="gold"
        />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: "center", padding: 28, gap: 28 },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.ink },
  subtitle: { fontFamily: fonts.displayItalic, fontSize: 16, color: colors.muted, marginTop: 6 },
  form: { gap: 14 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 15,
    fontSize: 18,
    letterSpacing: 6,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  error: { color: colors.berry },
});
