import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { colors, radius } from "@/theme";
import { haptic } from "./haptics";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  style,
  compact,
  onDark,
}: {
  /** Ghost button over a dark surface (camera). */
  onDark?: boolean;
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const inactive = disabled || loading;
  const fg = variant === "primary" || onDark ? colors.white : variant === "danger" ? colors.danger : colors.ink;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPressIn={() => (scale.value = withSpring(0.97, { damping: 20, stiffness: 400 }))}
      onPressOut={() => (scale.value = withSpring(1, { damping: 20, stiffness: 400 }))}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={[
        styles.base,
        compact && styles.compact,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "danger" && styles.dangerFill,
        disabled && styles.disabled,
        animated,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={18} color={fg} /> : null}
          <Text variant="bodyStrong" style={{ color: fg }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {label}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    borderRadius: radius.pill,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  compact: { minHeight: 44, paddingHorizontal: 18 },
  primary: { backgroundColor: colors.ink },
  secondary: { backgroundColor: colors.fill },
  dangerFill: { backgroundColor: colors.dangerSoft },
  disabled: { opacity: 0.32 },
  content: { flexDirection: "row", alignItems: "center", gap: 8 },
});
