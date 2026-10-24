import { Image } from "expo-image";
import { useEffect, useRef, type ComponentRef, type ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, useWindowDimensions, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import type { TradeId } from "@/domain/types";
import { allArt, tradeArt } from "@/templates/art";
import { colors, fonts, maxWidth, radius, shadow } from "@/theme";
import { haptic } from "./haptics";
import { Icon } from "./Icon";
import { Text } from "./Text";

/** A trade's 3D icon. `float` adds the design's gentle bob. */
export function TradeArt({ trade, size, float, rotate = 0 }: { trade: TradeId; size: number; float?: boolean; rotate?: number }) {
  const img = <Image source={tradeArt(trade)} style={{ width: size, height: size, transform: [{ rotate: `${rotate}deg` }] }} contentFit="contain" />;
  return float ? <Bob delay={0}>{img}</Bob> : img;
}

/** Moves its child up 5 px and back over 9 s, forever (the design's `hfloat`). */
function Bob({ children, delay }: { children: ReactNode; delay: number }) {
  const y = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const ease = Easing.inOut(Easing.sin);
    y.value = withDelay(delay, withRepeat(withSequence(withTiming(-5, { duration: 4500, easing: ease }), withTiming(0, { duration: 4500, easing: ease })), -1));
  }, [y, delay, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

// The home screen's pile of icons, laid out on the design's 390 px wide frame: [left, top, width, rotation, delay ms].
const PILE: [number, number, number, number, number][] = [
  [-2, 1, 226, -10, 0],
  [183, -17, 226, 12, 3000],
  [-33, 173, 212, -16, 6000],
  [152, 126, 212, -22, 1500],
  [87, 290, 192, 6, 4500],
  [243, 252, 176, 14, 7500],
  [-20, 374, 186, -6, 2500],
  [221, 415, 176, -10, 5500],
];

/** How much to scale the design's 390 px sizes on this screen: about 1 on phones, up to ~1.5 on an iPad. */
export function useScale() {
  const { width } = useWindowDimensions();
  return Math.min(width, maxWidth) / 390;
}

/** The floating cluster of trade icons above "What needs fixing?" / "Home fixes, handled." */
export function ArtPile({ count = 8, style }: { count?: number; style?: StyleProp<ViewStyle> }) {
  const k = useScale();
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ flex: 1, overflow: "visible" }, style]}>
      {PILE.slice(0, count).map(([left, top, w, rot, delay], i) => (
        <View key={i} style={{ position: "absolute", left: left * k, top: top * k }}>
          <Bob delay={delay}>
            <Image source={allArt[i]} style={{ width: w * k, height: w * k, transform: [{ rotate: `${rot}deg` }] }} contentFit="contain" />
          </Bob>
        </View>
      ))}
    </View>
  );
}

/** Six icons circling slowly ("Finding pros near you."). */
export function ArtOrbit({ size = 84, radiusPx = 110 }: { size?: number; radiusPx?: number }) {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) t.value = withRepeat(withTiming(1, { duration: 14000, easing: Easing.linear }), -1);
  }, [t, reduced]);
  return (
    <View pointerEvents="none" style={styles.orbit} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {allArt.slice(0, 6).map((src, i) => (
        <OrbitItem key={i} t={t} index={i} count={6} size={size} r={radiusPx} src={src} />
      ))}
    </View>
  );
}

function OrbitItem({ t, index, count, size, r, src }: { t: SharedValue<number>; index: number; count: number; size: number; r: number; src: number }) {
  const style = useAnimatedStyle(() => {
    const a = (index / count + t.value) * Math.PI * 2;
    return { transform: [{ translateX: Math.cos(a) * r - size / 2 }, { translateY: Math.sin(a) * r - size / 2 }] };
  });
  return (
    <Animated.View style={[{ position: "absolute", left: "50%", top: "50%" }, style]}>
      <Image source={src} style={{ width: size, height: size }} contentFit="contain" />
    </Animated.View>
  );
}

/** The thin indeterminate bar under "Finding pros near you." */
export function SlideBar() {
  const x = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) x.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }), -1);
  }, [x, reduced]);
  const style = useAnimatedStyle(() => ({ left: `${-40 + x.value * 140}%` }));
  return (
    <View style={styles.track} accessibilityRole="progressbar">
      <Animated.View style={[styles.slider, style]} />
    </View>
  );
}

/** A labelled white input ("First name", "Where"). */
export function Field({
  label,
  icon,
  style,
  ...input
}: TextInputProps & { label: string; icon?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Text variant="label" tone="soft" style={{ marginBottom: 8 }}>
        {label}
      </Text>
      <View style={[styles.field, shadow]}>
        {icon ? <Icon name={icon} size={20} color={colors.inkSoft} /> : null}
        <TextInput
          placeholderTextColor={colors.inkFaint}
          accessibilityLabel={label}
          {...input}
          style={styles.fieldInput}
        />
      </View>
    </View>
  );
}

/** A big white multi-line box ("Tell us where.", "Add a note for the pro"). */
export function NoteBox(props: TextInputProps) {
  return (
    <View style={[styles.note, shadow]}>
      <TextInput placeholderTextColor={colors.inkFaint} multiline textAlignVertical="top" maxLength={500} {...props} style={styles.noteInput} />
    </View>
  );
}

/** One box per digit over a hidden input, so the system keyboard and SMS autofill work. */
export function CodeInput({ value, onChange, length }: { value: string; onChange: (v: string) => void; length: number }) {
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityLabel={`${length}-digit code`} style={{ flexDirection: "row", gap: 8 }}>
      {Array.from({ length }, (_, i) => {
        const active = i === Math.min(value.length, length - 1);
        return (
          <View key={i} style={[styles.digit, active && { borderColor: colors.ink }]}>
            <Text variant="title">{value[i] ?? ""}</Text>
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        maxLength={length}
        style={styles.hidden}
        caretHidden
      />
    </Pressable>
  );
}

/** Black circle with an initial (pros on Quotes, bookings). */
export function Avatar({ name, size = 52 }: { name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
      <Text variant="heading" tone="white" style={{ fontSize: size * 0.4 }}>
        {name.trim()[0]?.toUpperCase() ?? "?"}
      </Text>
    </View>
  );
}

/** White rounded card with the soft shadow. Pressable when `onPress` is given. */
export function Card({ children, onPress, style, label }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; label?: string }) {
  if (!onPress) return <View style={[styles.card, shadow, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.card, shadow, pressed && { backgroundColor: colors.fillPressed }, style]}
    >
      {children}
    </Pressable>
  );
}

/** A label/value row inside a card ("Pro · Dan's Plumbing"). Pressable with a chevron when `onPress` is given. */
export function InfoRow({ label, value, onPress, last }: { label: string; value: string; onPress?: () => void; last?: boolean }) {
  const content = (
    <>
      <Text tone="soft">{label}</Text>
      <Text variant="bodyStrong" style={{ flex: 1, textAlign: "right" }} numberOfLines={2}>
        {value}
      </Text>
      {onPress ? <Icon name="chevron-right" size={18} color={colors.inkFaint} /> : null}
    </>
  );
  const style = [styles.infoRow, !last && styles.infoRule];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [style, pressed && { opacity: 0.6 }]}>
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}

const styles = StyleSheet.create({
  orbit: { flex: 1 },
  track: { height: 4, borderRadius: 999, backgroundColor: colors.line, overflow: "hidden" },
  slider: { position: "absolute", top: 0, height: 4, width: "40%", borderRadius: 999, backgroundColor: colors.ink },
  field: {
    height: 60,
    borderRadius: 20,
    backgroundColor: colors.card,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fieldInput: { flex: 1, height: "100%", fontFamily: fonts.medium, fontSize: 18, color: colors.ink },
  note: { minHeight: 180, borderRadius: radius.md, backgroundColor: colors.card, padding: 20 },
  noteInput: { flex: 1, minHeight: 140, fontFamily: fonts.regular, fontSize: 18, lineHeight: 24, color: colors.ink, padding: 0 },
  digit: {
    flex: 1,
    height: 68,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  hidden: { position: "absolute", width: 1, height: 1, opacity: 0 },
  card: { borderRadius: radius.lg, backgroundColor: colors.card, padding: 20 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 16 },
  infoRule: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});
