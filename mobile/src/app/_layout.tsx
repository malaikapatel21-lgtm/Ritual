import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { AuthProvider, useAuth } from "@/lib/AuthProvider";
import { ActivityIndicator, View } from "react-native";
import { FONT_ASSETS, colors } from "@/lib/theme";

function RootNavigator() {
  const { session, loading, onboardingComplete } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.berry} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="verify" />
      </Stack.Protected>

      <Stack.Protected guard={!!session && !onboardingComplete}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={!!session && onboardingComplete}>
        <Stack.Screen name="index" />
        <Stack.Screen name="chat" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts(FONT_ASSETS);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.berry} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
