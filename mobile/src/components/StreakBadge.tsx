import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { colors, fonts } from "@/lib/theme";

function Spark({ angle, delay }: { angle: number; delay: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [progress, delay]);

  const style = useAnimatedStyle(() => {
    const distance = 70 * progress.value;
    return {
      opacity: 1 - progress.value,
      transform: [
        { translateX: Math.cos(angle) * distance },
        { translateY: Math.sin(angle) * distance },
        { scale: 1 - progress.value * 0.4 },
      ],
    };
  });

  return <Animated.View style={[styles.spark, style]} />;
}

/** The streak count with a slow breathing pulse, plus a one-shot burst of
 * sparks radiating outward when `celebrate` is true (fired on a milestone
 * check-in). */
export function StreakBadge({ streak, celebrate }: { streak: number; celebrate: boolean }) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <View style={styles.wrap}>
      {celebrate &&
        Array.from({ length: 8 }).map((_, i) => (
          <Spark key={i} angle={(i / 8) * Math.PI * 2} delay={i * 30} />
        ))}
      <Animated.View style={pulseStyle}>
        <Text style={styles.number}>{streak}</Text>
      </Animated.View>
      <Text style={styles.label}>week streak</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", marginTop: 20 },
  number: { fontFamily: fonts.displayBlack, fontSize: 48, color: colors.berry },
  label: { fontSize: 13, color: colors.muted, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 },
  spark: {
    position: "absolute",
    top: 24,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.gold,
  },
});
