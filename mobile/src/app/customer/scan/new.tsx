import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import useSWR, { mutate } from "swr";
import type { TemplateSummary } from "@shared/scope";
import { ErrorText, Muted, Screen, Spinner, Title } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font, radius } from "@/lib/theme";

const ICONS: Record<string, string> = { mold: "🧫", plumbing_sink: "🚰" };

/** Pick what kind of problem it is. Each option is a /templates/*.json file. */
export default function NewScan() {
  const { data, error } = useSWR<{ templates: TemplateSummary[] }>("/api/templates");
  const [busy, setBusy] = useState<string | null>(null);
  const [startError, setStartError] = useState("");

  async function start(trade: string) {
    setBusy(trade);
    setStartError("");
    try {
      const { id } = await api<{ id: number }>("/api/scans", { body: { trade } });
      void mutate("/api/home");
      router.replace(`/customer/scan/${id}` as never);
    } catch (err) {
      setStartError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Title>What's the problem?</Title>
        <Muted style={{ fontSize: 16 }}>We'll guide you through a few photos. No typing needed.</Muted>
      </View>
      {error && !data ? <ErrorText>{error.message}</ErrorText> : null}
      {!data && !error ? <Spinner /> : null}
      {data?.templates.map((t) => (
        <Pressable
          key={t.trade}
          onPress={() => start(t.trade)}
          disabled={!!busy}
          style={({ pressed }) => [st.card, pressed && { borderColor: colors.brand600 }, !!busy && busy !== t.trade && { opacity: 0.5 }]}
          accessibilityRole="button"
        >
          <Text style={st.icon}>{ICONS[t.trade] ?? "🔧"}</Text>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={st.label}>{t.label}</Text>
            <Text style={st.desc}>{t.description}</Text>
            <Text style={st.meta}>
              {t.shots} photos · {t.questions} taps
            </Text>
          </View>
          {busy === t.trade ? <ActivityIndicator color={colors.brand600} /> : <Text style={st.chev}>›</Text>}
        </Pressable>
      ))}
      <ErrorText>{startError}</ErrorText>
      <Muted style={{ textAlign: "center", fontSize: 13 }}>If you smell gas or see sparks or smoke, leave and call 911 first.</Muted>
    </Screen>
  );
}

const st = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 16, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, padding: 20 },
  icon: { fontSize: 36 },
  label: { fontFamily: font.semibold, fontSize: 19, color: colors.ink },
  desc: { fontFamily: font.regular, fontSize: 15, color: colors.ink60, lineHeight: 21 },
  meta: { fontFamily: font.medium, fontSize: 13, color: colors.brand600, marginTop: 2 },
  chev: { fontSize: 28, color: colors.ink40 },
});
