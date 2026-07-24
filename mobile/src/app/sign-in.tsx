import { useState } from "react";
import { Text, TextInput, StyleSheet } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { supabase } from "@/lib/supabase";
import { Screen } from "@/components/Screen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { colors, fonts } from "@/lib/theme";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setError(null);
    setSending(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setSending(false);

    if (otpError) {
      setError(otpError.message);
      return;
    }
    router.push({ pathname: "/verify", params: { email: email.trim() } });
  }

  return (
    <Screen accent={colors.rust} style={styles.container}>
      <Animated.View entering={FadeInDown.duration(600)}>
        <Text style={styles.kicker}>WEEKLY · IN PERSON · WITH YOUR POD</Text>
        <Text style={styles.title}>RITUAL</Text>
        <Text style={styles.subtitle}>Enter your email and we'll send you a sign-in code.</Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(150).duration(600)} style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="YOU@EXAMPLE.COM"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <PrimaryButton
          title={sending ? "Sending…" : "Send code"}
          onPress={sendCode}
          disabled={sending || !email}
        />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: "center", padding: 28, gap: 28 },
  kicker: {
    fontFamily: fonts.label,
    fontSize: 14,
    color: colors.rust,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  title: { fontFamily: fonts.display, fontSize: 52, color: colors.ink, letterSpacing: 1 },
  subtitle: { fontFamily: fonts.body, fontSize: 16, color: colors.muted, marginTop: 10 },
  form: { gap: 14 },
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
});
