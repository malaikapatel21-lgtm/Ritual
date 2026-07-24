import { Pressable, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { colors, gradients } from "@/lib/theme";
import { hapticTap } from "@/lib/haptics";

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

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
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.96, { duration: 100 });
        hapticTap();
      }}
      onPressOut={() => (scale.value = withTiming(1, { duration: 150 }))}
      style={style}
    >
      <AnimatedGradient
        colors={variant === "gold" ? gradients.gold : gradients.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.button, animatedStyle, disabled && styles.disabled]}
      >
        <Text style={styles.text}>{title}</Text>
      </AnimatedGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.45 },
  text: { color: colors.surface, fontWeight: "700", fontSize: 16, letterSpacing: 0.3 },
});
