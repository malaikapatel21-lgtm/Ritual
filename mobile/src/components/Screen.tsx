import { useEffect } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors } from "@/lib/theme";

const RAY_COUNT = 16;

/** A slow-rotating sunburst built from plain Views — a classic vintage-badge
 * device, in flat low-opacity color rather than a soft blur. Each ray sits in
 * its own full-size wrapper so its rotation pivots around the shared center. */
function Sunburst({ color, size }: { color: string; size: number }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 60000, easing: Easing.linear }), -1, false);
  }, [rotation]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <Animated.View pointerEvents="none" style={[{ width: size, height: size }, spin]}>
      {Array.from({ length: RAY_COUNT }).map((_, i) => (
        <View key={i} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${(360 / RAY_COUNT) * i}deg` }] }]}>
          <View
            style={{
              position: "absolute",
              top: 0,
              left: size / 2 - 1.5,
              width: 3,
              height: size / 2,
              backgroundColor: color,
              opacity: 0.1,
            }}
          />
        </View>
      ))}
    </Animated.View>
  );
}

/** Shared root container: flat cream paper stock, a bold printed color band
 * across the very top, and a slow-rotating sunburst behind the header — no
 * soft gradients or blur, in keeping with the flat-color poster aesthetic. */
export function Screen({
  children,
  style,
  accent = colors.rust,
  edges = ["top", "bottom", "left", "right"],
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  accent?: string;
  /** Which safe-area edges to inset for. Screens that manage their own
   * bottom spacing can drop "bottom" to avoid double-padding. */
  edges?: Array<"top" | "bottom" | "left" | "right">;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.topBand, { backgroundColor: accent }]} />
      <View style={styles.sunburstWrap} pointerEvents="none">
        <Sunburst color={accent} size={420} />
      </View>
      <View
        style={{
          flex: 1,
          paddingTop: edges.includes("top") ? insets.top : 0,
          paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
          paddingLeft: edges.includes("left") ? insets.left : 0,
          paddingRight: edges.includes("right") ? insets.right : 0,
        }}
      >
        <View style={[styles.content, style]}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  topBand: { height: 6, width: "100%" },
  sunburstWrap: {
    position: "absolute",
    top: -160,
    right: -160,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flex: 1 },
});
