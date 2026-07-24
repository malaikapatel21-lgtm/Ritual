import { useEffect } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors } from "@/lib/theme";

function Blob({
  color,
  size,
  start,
  drift,
  duration,
}: {
  color: string;
  size: number;
  start: { top?: number; bottom?: number; left?: number; right?: number };
  drift: { x: number; y: number };
  duration: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, [progress, duration]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * drift.x },
      { translateY: progress.value * drift.y },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: 0.16,
          ...start,
        },
        style,
      ]}
    />
  );
}

/** Shared root container: warm editorial gradient backdrop with a couple of
 * slow-drifting color blobs behind the content. Used by every screen so the
 * "colorful, lots of moving graphics" look stays consistent app-wide. */
export function Screen({
  children,
  style,
  accent = colors.berry,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  accent?: string;
}) {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.background, colors.surfaceMuted]}
        style={StyleSheet.absoluteFill}
      />
      <Blob color={accent} size={260} start={{ top: -80, right: -70 }} drift={{ x: 24, y: 30 }} duration={9000} />
      <Blob
        color={colors.gold}
        size={220}
        start={{ bottom: -60, left: -60 }}
        drift={{ x: -20, y: -24 }}
        duration={11000}
      />
      <View style={[styles.content, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
});
