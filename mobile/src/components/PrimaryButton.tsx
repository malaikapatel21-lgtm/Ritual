import { Pressable, Text, View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { colors, fonts } from "@/lib/theme";
import { hapticTap } from "@/lib/haptics";

const OFFSET = 4;

/** A flat, hard-edged "stamped" button: a solid ink-colored duplicate sits
 * offset behind the fill, and pressing slides the fill down onto it — like a
 * printed button being pushed flat — instead of a soft scale-and-fade. */
export function PrimaryButton({
  title,
  onPress,
  disabled,
  variant = "primary",
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "gold";
  style?: StyleProp<ViewStyle>;
}) {
  const press = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: press.value }, { translateY: press.value }],
  }));

  const fill = variant === "gold" ? colors.mustard : colors.rust;

  return (
    <View style={style}>
      <View style={[styles.shadow, disabled && styles.disabled]} />
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          press.value = withTiming(OFFSET, { duration: 70 });
          hapticTap();
        }}
        onPressOut={() => (press.value = withTiming(0, { duration: 130 }))}
      >
        <Animated.View
          style={[styles.button, { backgroundColor: fill }, animatedStyle, disabled && styles.disabled]}
        >
          <Text style={styles.text}>{title.toUpperCase()}</Text>
        </Animated.View>
      </Pressable>
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
    borderRadius: 4,
    transform: [{ translateX: OFFSET }, { translateY: OFFSET }],
  },
  button: {
    borderRadius: 4,
    borderWidth: 2.5,
    borderColor: colors.ink,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.45 },
  text: {
    fontFamily: fonts.labelSemibold,
    color: colors.ink,
    fontSize: 18,
    letterSpacing: 1.2,
  },
});
