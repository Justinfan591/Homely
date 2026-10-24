import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { colors, radius, shadow } from "@/theme";
import { haptic } from "./haptics";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

/** primary: black pill. secondary: white pill. ghost: muted text only ("Not quite", "Skip"). */
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
  const fg =
    variant === "primary" || onDark ? colors.white : variant === "danger" ? colors.danger : variant === "ghost" ? colors.inkSoft : colors.ink;

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
        variant === "ghost" && styles.ghost,
        compact && styles.compact,
        variant === "primary" && styles.primary,
        variant === "secondary" && [styles.secondary, shadow],
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
          {icon ? <Icon name={icon} size={20} color={fg} /> : null}
          <Text
            variant={variant === "ghost" ? "label" : "bodyStrong"}
            style={{ color: fg, fontSize: variant === "ghost" ? 16 : 17 }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {label}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 64,
    borderRadius: radius.pill,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  ghost: { minHeight: 52 },
  compact: { minHeight: 48, paddingHorizontal: 20 },
  primary: { backgroundColor: colors.ink },
  secondary: { backgroundColor: colors.card },
  dangerFill: { backgroundColor: colors.dangerSoft },
  disabled: { opacity: 0.32 },
  content: { flexDirection: "row", alignItems: "center", gap: 10 },
});
