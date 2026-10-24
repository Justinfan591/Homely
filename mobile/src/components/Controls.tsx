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
import { colors, radius } from "@/theme";
import { haptic } from "./haptics";
import { Icon } from "./Icon";
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
        selected && styles.chipSelected,
        pressed && !selected && { backgroundColor: colors.fillPressed },
      ]}
    >
      <Text variant="bodyStrong" style={{ color: selected ? colors.white : colors.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** One dot per shot. Filled = captured, outlined = skipped, long = current. */
export function ProgressDots({
  steps,
  current,
  dark,
}: {
  steps: { state: "done" | "skipped" | "todo" }[];
  current: number;
  dark?: boolean;
}) {
  return (
    <View style={styles.dots} accessibilityLabel={`Photo ${current + 1} of ${steps.length}`}>
      {steps.map((s, i) => (
        <Dot key={i} active={i === current} state={s.state} dark={dark} />
      ))}
    </View>
  );
}

function Dot({ active, state, dark }: { active: boolean; state: "done" | "skipped" | "todo"; dark?: boolean }) {
  const w = useSharedValue(active ? 24 : 8);
  useEffect(() => {
    w.value = withSpring(active ? 24 : 8, { damping: 18, stiffness: 260 });
  }, [active, w]);
  const style = useAnimatedStyle(() => ({ width: w.value }));
  const on = dark ? colors.white : colors.ink;
  const off = dark ? "rgba(255,255,255,0.35)" : colors.line;
  return (
    <Animated.View
      style={[
        styles.dot,
        style,
        {
          backgroundColor: state === "done" || active ? on : state === "skipped" ? "transparent" : off,
          borderColor: state === "skipped" ? (dark ? "rgba(255,255,255,0.6)" : colors.inkFaint) : "transparent",
          borderWidth: state === "skipped" && !active ? 1.5 : 0,
          opacity: active || state !== "todo" ? 1 : 0.9,
        },
      ]}
    />
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

export function Stars({ value, onChange, size = 40 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, justifyContent: "center" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          disabled={!onChange}
          accessibilityRole="button"
          accessibilityLabel={`${n} star${n > 1 ? "s" : ""}`}
          hitSlop={4}
          onPress={() => {
            haptic.select();
            onChange?.(n);
          }}
        >
          <Icon name="star" size={size} color={n <= value ? colors.ink : colors.line} />
        </Pressable>
      ))}
    </View>
  );
}

type PillTone = "neutral" | "accent" | "success" | "warn" | "danger";
const pill: Record<PillTone, [string, string]> = {
  neutral: [colors.white, colors.inkSoft],
  accent: [colors.accentSoft, colors.accent],
  success: [colors.successSoft, colors.success],
  warn: [colors.warnSoft, colors.warn],
  danger: [colors.dangerSoft, colors.danger],
};

export function Pill({ label, tone = "neutral" }: { label: string; tone?: PillTone }) {
  const [bg, fg] = pill[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text variant="caption" style={{ color: fg, fontFamily: "Inter_500Medium" }}>
        {label}
      </Text>
    </View>
  );
}

export function Skeleton({ height, width, radius: r = 12, style }: { height: number; width?: number | `${number}%`; radius?: number; style?: object }) {
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.5, { duration: 700 })), -1);
  }, [o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height, width: width ?? "100%", borderRadius: r, backgroundColor: colors.fill }, anim, style]} />;
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  chipSelected: { backgroundColor: colors.ink },
  dots: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { height: 8, borderRadius: 4 },
  severity: { flexDirection: "row", gap: 4 },
  segment: { flex: 1, height: 8, borderRadius: 4 },
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
});
