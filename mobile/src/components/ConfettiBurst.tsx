import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors } from "@/lib/theme";

const PIECE_COLORS = [colors.rust, colors.pine, colors.mustard, colors.denim, colors.ink];

function ConfettiPiece({ index }: { index: number }) {
  const progress = useSharedValue(0);
  const startX = (Math.random() - 0.5) * 320;
  const endX = startX + (Math.random() - 0.5) * 140;
  const fallDistance = 240 + Math.random() * 160;
  const spin = (Math.random() - 0.5) * 900;
  const delay = Math.random() * 180;
  const duration = 1000 + Math.random() * 500;
  const color = PIECE_COLORS[index % PIECE_COLORS.length];
  const isSquare = index % 3 === 0;

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.quad) }));
    // progress is a stable shared value ref; this fires once per mount, which
    // is exactly right since the parent mounts a fresh burst each celebration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: startX + (endX - startX) * progress.value },
      { translateY: progress.value * fallDistance },
      { rotate: `${spin * progress.value}deg` },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.piece, isSquare && styles.square, { backgroundColor: color }, style]}
    />
  );
}

/** One-shot confetti burst radiating from the top-center of whatever it's
 * rendered inside. Mount it conditionally (e.g. `{celebrating && <ConfettiBurst />}`)
 * for a moment like "pod matched" or "streak milestone" — it doesn't loop or
 * clean up after itself, since the parent unmounts it once the moment passes. */
export function ConfettiBurst({ count = 28 }: { count?: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap]} pointerEvents="none">
      {Array.from({ length: count }).map((_, i) => (
        <ConfettiPiece key={i} index={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  piece: { position: "absolute", top: 0, width: 9, height: 15, borderRadius: 1 },
  square: { width: 10, height: 10 },
});
