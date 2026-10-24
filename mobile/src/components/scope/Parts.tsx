import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SEVERITY_LABELS } from "@shared/scope";
import { colors, font, radius } from "@/lib/theme";
import { Button } from "../ui";

export function Kicker({ children }: { children: React.ReactNode }) {
  return <Text style={st.kicker}>{children}</Text>;
}

/** Five segments filled up to the severity. */
export function SeverityBar({ value }: { value: number }) {
  const tone = value >= 4 ? colors.red600 : value === 3 ? "#F59E0B" : colors.brand600;
  return (
    <View style={{ gap: 6 }}>
      <View style={st.sevRow}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={[st.sevSeg, { backgroundColor: i <= value ? tone : colors.tint }]} />
        ))}
      </View>
      <Text style={st.sevLabel}>
        {SEVERITY_LABELS[value] ?? ""} · {value}/5
      </Text>
    </View>
  );
}

/** Label on the left, value on the right. */
export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={st.fact}>
      <Text style={st.factLabel}>{label}</Text>
      {typeof children === "string" ? <Text style={st.factValue}>{children}</Text> : children}
    </View>
  );
}

export function ProviderRow({
  provider,
  distanceKm,
}: {
  provider: { name: string; rating: number; ratingCount: number; phone?: string | null };
  distanceKm?: number | null;
}) {
  return (
    <View style={st.provider}>
      <View style={st.avatar}>
        <Text style={st.avatarText}>{provider.name[0]}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={st.providerName}>{provider.name}</Text>
        <Text style={st.providerMeta}>
          ★ {provider.rating.toFixed(1)} ({provider.ratingCount})
          {distanceKm != null ? ` · ${distanceKm} km away` : ""}
        </Text>
      </View>
      {provider.phone ? <Button title="Call" variant="secondary" onPress={() => Linking.openURL(`tel:${provider.phone}`)} /> : null}
    </View>
  );
}

export function Stars({ value, onPick, size = 44 }: { value: number; onPick?: (n: number) => void; size?: number }) {
  return (
    <View style={st.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} disabled={!onPick} onPress={() => onPick?.(n)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? "s" : ""}`}>
          <Text style={{ fontSize: size, color: n <= value ? colors.star : colors.borderStrong }}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Progress dots for the capture screen. */
export function Dots({ states }: { states: ("done" | "current" | "todo")[] }) {
  return (
    <View style={st.dots}>
      {states.map((s, i) => (
        <View key={i} style={[st.dot, s === "done" && st.dotDone, s === "current" && st.dotCurrent]} />
      ))}
    </View>
  );
}

/** Accepted → On the way → Done. */
export function Stepper({ step, labels }: { step: number; labels: string[] }) {
  return (
    <View style={st.stepper}>
      {labels.map((l, i) => (
        <View key={l} style={{ flex: 1, gap: 6 }}>
          <View style={[st.stepBar, { backgroundColor: i <= step ? colors.brand600 : colors.tint }]} />
          <Text style={[st.stepLabel, i <= step && { color: colors.ink }]}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

export function BigStatus({ title, subtitle, tone = "brand" }: { title: string; subtitle?: string; tone?: "brand" | "green" | "warn" }) {
  const bg = tone === "green" ? colors.green50 : tone === "warn" ? colors.amber50 : colors.brand50;
  return (
    <View style={[st.big, { backgroundColor: bg }]}>
      <Text style={st.bigTitle}>{title}</Text>
      {subtitle ? <Text style={st.bigSub}>{subtitle}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  kicker: { fontFamily: font.semibold, fontSize: 13, letterSpacing: 0.6, textTransform: "uppercase", color: colors.brand600 },
  sevRow: { flexDirection: "row", gap: 4 },
  sevSeg: { flex: 1, height: 8, borderRadius: 4 },
  sevLabel: { fontFamily: font.medium, fontSize: 14, color: colors.ink75 },
  fact: { gap: 4 },
  factLabel: { fontFamily: font.medium, fontSize: 13, color: colors.ink50 },
  factValue: { fontFamily: font.regular, fontSize: 16, color: colors.ink, lineHeight: 22 },
  provider: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand50, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: font.bold, fontSize: 18, color: colors.brand600 },
  providerName: { fontFamily: font.semibold, fontSize: 17, color: colors.ink },
  providerMeta: { fontFamily: font.regular, fontSize: 14, color: colors.ink60 },
  stars: { flexDirection: "row", justifyContent: "center", gap: 6 },
  dots: { flexDirection: "row", gap: 8, alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.35)" },
  dotDone: { backgroundColor: colors.white },
  dotCurrent: { backgroundColor: colors.brand500, width: 22 },
  stepper: { flexDirection: "row", gap: 8 },
  stepBar: { height: 6, borderRadius: 3 },
  stepLabel: { fontFamily: font.medium, fontSize: 13, color: colors.ink40 },
  big: { borderRadius: radius.lg, padding: 20, gap: 6 },
  bigTitle: { fontFamily: font.bold, fontSize: 24, color: colors.ink, letterSpacing: -0.3 },
  bigSub: { fontFamily: font.regular, fontSize: 16, color: colors.ink75, lineHeight: 22 },
});
