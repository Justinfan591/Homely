import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { colors, fonts, radius, shadow } from "@/theme";
import { haptic } from "./haptics";
import { Text } from "./Text";

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        shadow,
        selected && styles.chipSelected,
        pressed && !selected && { backgroundColor: colors.fillPressed },
      ]}
    >
      <Text variant="label" style={{ color: selected ? colors.white : colors.ink, fontSize: 16 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A tall white row with a radio on the right; black when picked (Questions, Book · when). */
export function ChoiceRow({
  label,
  detail,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  /** Muted text after the label, e.g. "8 – 12". */
  detail?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      disabled={disabled}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => [
        styles.choice,
        shadow,
        selected && { backgroundColor: colors.ink },
        pressed && !selected && { backgroundColor: colors.fillPressed },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text variant="option" style={{ color: selected ? colors.white : colors.ink, flexShrink: 1 }}>
        {label}
      </Text>
      {detail ? (
        <Text variant="option" style={{ color: selected ? colors.inkFaint : colors.inkSoft, fontFamily: fonts.regular }}>
          {detail}
        </Text>
      ) : null}
      <View style={{ flex: 1 }} />
      <View style={[styles.radio, { borderColor: selected ? colors.white : colors.ring }]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

/** One day in the "When works for you?" strip. */
export function DayPill({ name, num, selected, onPress }: { name: string; num: number; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name} ${num}`}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => [styles.day, shadow, selected && { backgroundColor: colors.ink }, pressed && !selected && { backgroundColor: colors.fillPressed }]}
    >
      <Text variant="label" style={{ color: selected ? colors.inkFaint : colors.inkSoft }}>
        {name}
      </Text>
      <Text variant="title" style={{ color: selected ? colors.white : colors.ink }}>
        {num}
      </Text>
    </Pressable>
  );
}

/** The design's rounded star, filled yellow when on. */
export function Star({ size = 14, on = true }: { size?: number; on?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2 6.3 20.3l1.2-6.4L2.8 9.5l6.4-.8z"
        fill={on ? colors.star : "none"}
        stroke={on ? colors.star : colors.ring}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SeverityBar({ level }: { level: number }) {
  const tone = level >= 4 ? colors.danger : level === 3 ? colors.warn : colors.success;
  return (
    <View style={styles.severity} accessibilityLabel={`Severity ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <View key={n} style={[styles.segment, { backgroundColor: n <= level ? tone : colors.line }]} />
      ))}
    </View>
  );
}

const STAR_NAMES = ["Poor", "Fair", "Good", "Great", "Excellent"];

export function Stars({ value, onChange, size = 44 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          disabled={!onChange}
          accessibilityRole="button"
          accessibilityLabel={`${n} star${n > 1 ? "s" : ""}: ${STAR_NAMES[n - 1]}`}
          hitSlop={4}
          onPress={() => {
            haptic.select();
            onChange?.(n);
          }}
        >
          <Star size={size} on={n <= value} />
        </Pressable>
      ))}
    </View>
  );
}

export function Skeleton({ height, width, radius: r = 12, style }: { height: number; width?: number | `${number}%`; radius?: number; style?: object }) {
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.5, { duration: 700 })), -1);
  }, [o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height, width: width ?? "100%", borderRadius: r, backgroundColor: "rgba(255,255,255,0.6)" }, anim, style]} />;
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  choice: {
    minHeight: 68,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.white },
  day: {
    flex: 1,
    height: 104,
    borderRadius: 26,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  chipSelected: { backgroundColor: colors.ink },
  severity: { flexDirection: "row", gap: 4 },
  segment: { flex: 1, height: 8, borderRadius: 4 },
});
