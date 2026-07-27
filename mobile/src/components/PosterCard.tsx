import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "@/lib/theme";

const OFFSET = 4;

/** A flat card with a thick ink border and a solid offset duplicate behind
 * it — the same "printed and stacked slightly askew" device used by
 * PrimaryButton and StreakBadge, reused wherever a list row or option needs
 * that hard-edged poster look instead of a soft bordered box. */
export function PosterCard({
  children,
  style,
  borderColor = colors.ink,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderColor?: string;
}) {
  return (
    <View style={style}>
      <View style={styles.shadow} />
      <View style={[styles.card, { borderColor }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.ink,
    borderRadius: 6,
    transform: [{ translateX: OFFSET }, { translateY: OFFSET }],
  },
  card: {
    borderWidth: 2.5,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
});
