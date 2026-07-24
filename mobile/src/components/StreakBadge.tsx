import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors, fonts } from "@/lib/theme";

const OFFSET = 4;
const SIZE = 128;

/** The streak count as a circular stamped badge — thick ink border, flat
 * mustard fill, a slight permanent tilt like a rubber-stamped seal. A slow
 * breathing scale plays at idle; a milestone check-in adds a one-shot
 * "stamp impact" punch layered on top without interrupting the loop. */
export function StreakBadge({ streak, celebrate }: { streak: number; celebrate: boolean }) {
  const breathe = useSharedValue(1);
  const punch = useSharedValue(1);

  useEffect(() => {
    breathe.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, [breathe]);

  useEffect(() => {
    if (celebrate) {
      punch.value = withSequence(
        withTiming(1.3, { duration: 140, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 320, easing: Easing.out(Easing.back(2)) })
      );
    }
  }, [celebrate, punch]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathe.value * punch.value }, { rotate: "-4deg" }],
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.shadow} />
      <Animated.View style={[styles.badge, animatedStyle]}>
        <Text style={styles.number}>{streak}</Text>
        <Text style={styles.label}>week{"\n"}streak</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", marginTop: 16, width: SIZE, height: SIZE, alignSelf: "center" },
  shadow: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.ink,
    transform: [{ translateX: OFFSET }, { translateY: OFFSET }],
  },
  badge: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.mustard,
    alignItems: "center",
    justifyContent: "center",
  },
  number: { fontFamily: fonts.display, fontSize: 38, color: colors.ink, lineHeight: 42 },
  label: {
    fontFamily: fonts.label,
    fontSize: 12,
    color: colors.ink,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "center",
    marginTop: 2,
  },
});
