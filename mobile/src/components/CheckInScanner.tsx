import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { PrimaryButton } from "@/components/PrimaryButton";
import { colors, fonts } from "@/lib/theme";

/** Full-screen overlay: scan the QR code posted at the venue (or type it in)
 * and verify it against the ritual's check_in_code before letting the caller
 * proceed to handle_checkin. This is a physical-presence proxy, not
 * cryptographic security — the code is visible to anyone at the venue (and,
 * since `rituals` has no RLS, to the signed-in app itself) by design. */
export function CheckInScanner({
  expectedCode,
  onVerified,
  onCancel,
}: {
  expectedCode: string;
  onVerified: () => void;
  onCancel: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manualEntry, setManualEntry] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scanLocked, setScanLocked] = useState(false);

  function checkCode(code: string) {
    if (code.trim().toUpperCase() === expectedCode.toUpperCase()) {
      onVerified();
      return;
    }
    setError("That code doesn't match this ritual's venue. Try again.");
    setScanLocked(false);
  }

  const showCamera = !manualEntry && permission?.granted;

  return (
    <View style={styles.overlay}>
      <Text style={styles.title}>Scan to check in</Text>
      <Text style={styles.subtitle}>Find the code posted at your venue.</Text>

      {!manualEntry && !permission?.granted && (
        <View style={styles.box}>
          <Text style={styles.body}>We need camera access to scan the check-in code.</Text>
          <PrimaryButton title="Allow camera" onPress={() => requestPermission()} />
        </View>
      )}

      {showCamera && (
        <View style={styles.cameraBox}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={
              scanLocked
                ? undefined
                : ({ data }) => {
                    setScanLocked(true);
                    checkCode(data);
                  }
            }
          />
        </View>
      )}

      {manualEntry && (
        <View style={styles.box}>
          <TextInput
            style={styles.input}
            placeholder="Venue code"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            value={manualCode}
            onChangeText={setManualCode}
          />
          <PrimaryButton title="Check in" onPress={() => checkCode(manualCode)} disabled={!manualCode.trim()} />
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        onPress={() => {
          setManualEntry((v) => !v);
          setError(null);
        }}
      >
        <Text style={styles.link}>
          {manualEntry ? "Scan a QR code instead" : "Enter the code manually instead"}
        </Text>
      </Pressable>

      <Pressable onPress={onCancel}>
        <Text style={styles.cancel}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
    padding: 24,
    paddingTop: 72,
    alignItems: "center",
    gap: 16,
  },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.ink },
  subtitle: { fontSize: 15, color: colors.muted, textAlign: "center" },
  body: { fontSize: 15, color: colors.ink, textAlign: "center" },
  box: { width: "100%", gap: 12 },
  cameraBox: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: colors.ink,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 15,
    fontSize: 18,
    letterSpacing: 4,
    textAlign: "center",
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  error: { color: colors.berry, textAlign: "center" },
  link: { color: colors.teal, fontWeight: "600" },
  cancel: { color: colors.muted, marginTop: 8 },
});
