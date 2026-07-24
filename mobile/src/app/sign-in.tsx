import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";

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
    <View style={styles.container}>
      <Text style={styles.title}>Ritual Pods</Text>
      <Text style={styles.subtitle}>Enter your email and we'll send you a sign-in code.</Text>

      <TextInput
        style={styles.input}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, (sending || !email) && styles.buttonDisabled]}
        disabled={sending || !email}
        onPress={sendCode}
      >
        <Text style={styles.buttonText}>{sending ? "Sending…" : "Send code"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: "700" },
  subtitle: { fontSize: 15, color: "#666", marginBottom: 12 },
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
});
