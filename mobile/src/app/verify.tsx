import { useRef, useState } from "react";
import {
  Text,
  TextInput,
  StyleSheet,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { supabase } from "@/lib/supabase";
import { Screen } from "@/components/Screen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { colors, fonts } from "@/lib/theme";
import { hapticError, hapticSelect, hapticSuccess } from "@/lib/haptics";

const CODE_LENGTH = 6;

export default function Verify() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Array<TextInput | null>>([]);
  const shake = useSharedValue(0);

  async function verify(fullCode: string) {
    setError(null);
    setVerifying(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: fullCode,
      type: "email",
    });
    setVerifying(false);

    if (verifyError) {
      hapticError();
      setError(verifyError.message);
      setDigits(Array(CODE_LENGTH).fill(""));
      inputs.current[0]?.focus();
      shake.value = withSequence(
        withTiming(-10, { duration: 45 }),
        withTiming(10, { duration: 90 }),
        withTiming(-8, { duration: 90 }),
        withTiming(0, { duration: 60 })
      );
      return;
    }
    hapticSuccess();
    // On success, AuthProvider's onAuthStateChange picks up the new session
    // and the root layout routes away from this screen automatically.
  }

  function onChangeDigit(text: string, index: number) {
    // A full code pasted into one box arrives here as a single onChangeText
    // call with more than one character — spread it across all the boxes.
    if (text.length > 1) {
      const pasted = text.replace(/\D/g, "").slice(0, CODE_LENGTH).split("");
      const next = Array(CODE_LENGTH).fill("");
      pasted.forEach((d, i) => {
        next[i] = d;
      });
      setDigits(next);
      if (pasted.length === CODE_LENGTH) {
        inputs.current[CODE_LENGTH - 1]?.blur();
        verify(pasted.join(""));
      } else {
        inputs.current[pasted.length]?.focus();
      }
      return;
    }

    const digit = text.replace(/\D/g, "");
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (!digit) return;
    hapticSelect();
    if (index < CODE_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
      return;
    }
    inputs.current[index]?.blur();
    const fullCode = next.join("");
    if (fullCode.length === CODE_LENGTH) verify(fullCode);
  }

  function onKeyPress(event: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) {
    if (event.nativeEvent.key === "Backspace" && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      inputs.current[index - 1]?.focus();
    }
  }

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const code = digits.join("");

  return (
    <Screen accent={colors.mustard} style={styles.container}>
      <Animated.View entering={FadeInDown.duration(600)}>
        <Text style={styles.title}>CHECK YOUR EMAIL</Text>
        <Text style={styles.subtitle}>Enter the code we sent to {email}.</Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(150).duration(600)} style={styles.form}>
        <Animated.View style={[styles.boxRow, shakeStyle]}>
          {Array.from({ length: CODE_LENGTH }).map((_, i) => (
            <TextInput
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              style={[styles.box, digits[i] ? styles.boxFilled : null]}
              keyboardType="number-pad"
              maxLength={CODE_LENGTH}
              value={digits[i]}
              onChangeText={(text) => onChangeDigit(text, i)}
              onKeyPress={(event) => onKeyPress(event, i)}
              editable={!verifying}
              selectTextOnFocus
            />
          ))}
        </Animated.View>

        {error && <Text style={styles.error}>{error}</Text>}

        <PrimaryButton
          title={verifying ? "Verifying…" : "Verify"}
          onPress={() => verify(code)}
          disabled={verifying || code.length < CODE_LENGTH}
          variant="gold"
        />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: "center", padding: 28, gap: 28 },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 16, color: colors.muted, marginTop: 8 },
  form: { gap: 14 },
  boxRow: { flexDirection: "row", justifyContent: "space-between" },
  box: {
    width: 46,
    height: 58,
    borderWidth: 2.5,
    borderColor: colors.ink,
    borderRadius: 6,
    fontFamily: fonts.bodyBold,
    fontSize: 22,
    textAlign: "center",
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  boxFilled: { borderColor: colors.mustard, backgroundColor: colors.paperDeep },
  error: { fontFamily: fonts.bodyMedium, color: colors.rust },
});
