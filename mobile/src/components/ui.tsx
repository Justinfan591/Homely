import { forwardRef, type ComponentRef } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { STATUS_LABELS, TRADE_LABELS, type Trade } from "@shared/types";
import { colors, radius } from "@/lib/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const buttonStyles: Record<Variant, { box: ViewStyle; text: TextStyle; spinner: string }> = {
  primary: { box: { backgroundColor: colors.brand600 }, text: { color: colors.white }, spinner: colors.white },
  secondary: { box: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderStrong }, text: { color: colors.ink }, spinner: colors.ink },
  ghost: { box: { backgroundColor: "transparent" }, text: { color: colors.ink75 }, spinner: colors.ink },
  danger: { box: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.red200 }, text: { color: colors.red700 }, spinner: colors.red700 },
};

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
  textStyle,
  large,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  large?: boolean;
}) {
  const v = buttonStyles[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      style={({ pressed }) => [s.button, large && s.buttonLarge, v.box, off && s.disabled, pressed && !off && s.pressed, style]}
    >
      {loading && <ActivityIndicator size="small" color={v.spinner} />}
      <Text style={[s.buttonText, large && s.buttonTextLarge, v.text, textStyle]}>{title}</Text>
    </Pressable>
  );
}

export function LinkText({ title, onPress, style }: { title: string; onPress: () => void; style?: StyleProp<TextStyle> }) {
  return (
    <Text onPress={onPress} style={[s.link, style]} accessibilityRole="link">
      {title}
    </Text>
  );
}

export function Spinner() {
  return (
    <View style={s.spinnerWrap}>
      <ActivityIndicator color={colors.brand600} />
    </View>
  );
}

export function Card({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      {children}
      {hint && <Text style={s.hint}>{hint}</Text>}
    </View>
  );
}

export const Input = forwardRef<ComponentRef<typeof TextInput>, TextInputProps>(function Input({ style, multiline, ...rest }, ref) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.ink40}
      multiline={multiline}
      style={[s.input, multiline && s.inputMulti, style]}
      {...rest}
    />
  );
});

export function ErrorText({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <Text style={s.error}>{children}</Text>;
}

export function Notice({ children, tone = "brand" }: { children: React.ReactNode; tone?: "brand" | "warn" | "danger" }) {
  const t = noticeTones[tone];
  return <View style={[s.notice, t.box]}>{typeof children === "string" ? <Text style={t.text}>{children}</Text> : children}</View>;
}

function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const statusColors: Record<string, [string, string]> = {
  intake: ["#f1f5f9", "#334155"],
  report_ready: ["#e0f2fe", "#075985"],
  open: ["#fef3c7", "#92400e"],
  agent_review: ["#ede9fe", "#5b21b6"],
  more_info: [colors.amber50, colors.amber900],
  assigned: [colors.brand100, colors.brand900],
  en_route: [colors.brand100, colors.brand900],
  in_progress: [colors.brand100, colors.brand900],
  completed: ["#059669", colors.white],
  cancelled: ["#e2e8f0", "#475569"],
};

export function StatusBadge({ status }: { status: string }) {
  const [bg, fg] = statusColors[status] ?? ["#f1f5f9", "#334155"];
  return <Badge label={STATUS_LABELS[status] ?? status} bg={bg} fg={fg} />;
}

const urgency: Record<string, [string, string, string]> = {
  emergency: ["Emergency", colors.red600, colors.white],
  soon: ["Soon", "#ffedd5", "#9a3412"],
  flexible: ["Flexible", "#f1f5f9", "#334155"],
};

export function UrgencyBadge({ urgency: u }: { urgency?: string | null }) {
  if (!u || !urgency[u]) return null;
  const [label, bg, fg] = urgency[u];
  return <Badge label={label} bg={bg} fg={fg} />;
}

export function TradeBadge({ trade }: { trade?: string | null }) {
  if (!trade) return null;
  return <Badge label={TRADE_LABELS[trade as Trade] ?? trade} bg={colors.tint} fg={colors.ink} />;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>{title}</Text>
      {children ? typeof children === "string" ? <Text style={s.emptyBody}>{children}</Text> : children : null}
    </View>
  );
}

/** A tappable pill used for choices (answers, trades, toggles). */
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, selected && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected }}>
      <Text style={[s.chipText, selected && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={s.chipRow}>{children}</View>;
}

/** Two or more options in a pill-shaped switcher. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={s.segment}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segmentItem, value === o.value && s.segmentOn]}>
          <Text style={[s.segmentText, value === o.value && s.segmentTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Scrollable page body with padding, pull-to-refresh and keyboard avoidance. */
export type ScreenRef = ComponentRef<typeof ScrollView>;

export const Screen = forwardRef<
  ScreenRef,
  { children: React.ReactNode; onRefresh?: () => Promise<unknown>; refreshing?: boolean; style?: StyleProp<ViewStyle> }
>(function Screen({ children, onRefresh, refreshing = false, style }, ref) {
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}>
      <ScrollView
        ref={ref}
        contentContainerStyle={[s.screen, style]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.brand600} /> : undefined}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
});

export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.title, style]}>{children}</Text>;
}
export function Heading({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.heading, style]}>{children}</Text>;
}
export function Muted({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}
export function Body({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.body, style]}>{children}</Text>;
}

export const s = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  buttonLarge: { paddingVertical: 14 },
  buttonText: { fontSize: 15, fontWeight: "600" },
  buttonTextLarge: { fontSize: 16 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  link: { color: colors.brand700, fontWeight: "600" },
  spinnerWrap: { paddingVertical: 32, alignItems: "center" },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: { fontSize: 14, fontWeight: "500", marginBottom: 6, color: colors.ink },
  hint: { fontSize: 12, color: colors.ink50, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 9,
    fontSize: 16,
    color: colors.ink,
  },
  inputMulti: { minHeight: 64, textAlignVertical: "top" },
  error: { backgroundColor: colors.red50, color: colors.red700, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, overflow: "hidden" },
  notice: { borderRadius: radius.md, padding: 12, borderWidth: 1 },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" },
  badgeText: { fontSize: 12, fontWeight: "600" },
  empty: { borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(0,0,0,0.15)", borderRadius: radius.lg, paddingHorizontal: 20, paddingVertical: 32, alignItems: "center", gap: 4 },
  emptyTitle: { fontWeight: "600", fontSize: 15, color: colors.ink, textAlign: "center" },
  emptyBody: { fontSize: 14, color: colors.ink60, textAlign: "center" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.brand600, borderColor: colors.brand600 },
  chipText: { fontSize: 14, fontWeight: "500", color: colors.ink },
  chipTextOn: { color: colors.white },
  segment: { flexDirection: "row", backgroundColor: colors.tint, borderRadius: radius.md, padding: 4, gap: 4 },
  segmentItem: { flex: 1, borderRadius: radius.sm, paddingVertical: 9, alignItems: "center" },
  segmentOn: { backgroundColor: colors.white, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { fontSize: 14, fontWeight: "600", color: colors.ink60 },
  segmentTextOn: { color: colors.ink },
  screen: { padding: 16, paddingBottom: 48, gap: 16 },
  title: { fontSize: 24, fontWeight: "700", color: colors.ink, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: "700", color: colors.ink },
  muted: { fontSize: 14, color: colors.ink60, lineHeight: 20 },
  body: { fontSize: 15, color: colors.ink, lineHeight: 21 },
});

const tone = StyleSheet.create({
  brandBox: { backgroundColor: colors.brand50, borderColor: colors.brand200 },
  brandText: { color: colors.brand900, fontSize: 14, lineHeight: 20 },
  warnBox: { backgroundColor: colors.amber50, borderColor: colors.amber200 },
  warnText: { color: colors.amber900, fontSize: 14, lineHeight: 20 },
  dangerBox: { backgroundColor: colors.red50, borderColor: colors.red200 },
  dangerText: { color: colors.red800, fontSize: 14, lineHeight: 20, fontWeight: "500" },
});

const noticeTones = {
  brand: { box: tone.brandBox, text: tone.brandText },
  warn: { box: tone.warnBox, text: tone.warnText },
  danger: { box: tone.dangerBox, text: tone.dangerText },
};
