import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Skeleton } from "@/components/Controls";
import { haptic } from "@/components/haptics";
import { Icon } from "@/components/Icon";
import { RecordRow } from "@/components/RecordRow";
import { Sheet } from "@/components/Sheet";
import { EmptyState, ErrorState } from "@/components/States";
import { Text } from "@/components/Text";
import { useRecord } from "@/hooks/data";
import { useHome } from "@/hooks/home";
import { api } from "@/services";
import { templates } from "@/templates";
import { colors, gutter, radius } from "@/theme";

export default function Home() {
  const insets = useSafeAreaInsets();
  const { home, homes, select } = useHome();
  const record = useRecord(home?.id);
  const [picker, setPicker] = useState<"trade" | "home" | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const attention = record.data?.find((i) => i.status === "needs_info");

  async function start(trade: string) {
    if (!home || starting) return;
    setStarting(trade);
    setStartError(null);
    try {
      const scan = await api.createScan(home.id, trade);
      setPicker(null);
      router.push(`/scan/${scan.id}`);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Couldn't start a scan.");
    } finally {
      setStarting(null);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <Text variant="heading" style={{ letterSpacing: -0.6 }}>
            Scope
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Home: ${home?.name ?? "loading"}. Change home`}
            onPress={() => {
              haptic.tap();
              setPicker("home");
            }}
            style={({ pressed }) => [styles.homePill, pressed && { backgroundColor: colors.fillPressed }]}
          >
            <Icon name="home" size={15} />
            <Text variant="label" numberOfLines={1} style={{ maxWidth: 170 }}>
              {home?.name ?? " "}
            </Text>
            <Icon name="chevron-down" size={15} color={colors.inkSoft} />
          </Pressable>
        </View>

        <Animated.View entering={FadeInDown.duration(400)} style={styles.hero}>
          <Text variant="display">Point at the problem.{"\n"}Get it fixed.</Text>
          <Text tone="soft" style={{ marginTop: 12 }}>
            Take a few photos. We'll scope the job, price it and send the right pro.
          </Text>
          <Button
            label="Scan a problem"
            icon="camera"
            onPress={() => setPicker("trade")}
            disabled={!home}
            style={{ marginTop: 28 }}
          />
        </Animated.View>

        <View style={styles.sectionHead}>
          <Text variant="heading" style={{ flexShrink: 0 }}>
            Home record
          </Text>
          {home ? (
            <Text variant="caption" tone="soft" numberOfLines={1} style={{ flexShrink: 1 }}>
              {home.address}
            </Text>
          ) : null}
        </View>

        {attention ? (
          <Pressable
            onPress={() => router.push(attention.href as never)}
            style={({ pressed }) => [styles.banner, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
          >
            <View style={styles.bannerIcon}>
              <Icon name="camera" size={18} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{attention.followUp?.provider ?? "A pro"} needs one more photo</Text>
              <Text variant="caption" tone="soft" numberOfLines={2}>
                {attention.followUp?.message}
              </Text>
            </View>
            <Icon name="arrow-right" size={20} color={colors.accent} />
          </Pressable>
        ) : null}

        <View style={{ gap: 10 }}>
          {record.isLoading ? (
            <>
              <Skeleton height={86} radius={radius.md} />
              <Skeleton height={86} radius={radius.md} />
            </>
          ) : record.error ? (
            <ErrorState message="We couldn't load your home record." onRetry={() => record.mutate()} />
          ) : record.data && record.data.length === 0 ? (
            <EmptyState
              icon="clipboard"
              title="Nothing here yet"
              body="Scans and jobs for this home will show up here, so you always have a record."
            />
          ) : (
            record.data?.filter((i) => i !== attention).map((item) => <RecordRow key={item.id} item={item} />)
          )}
        </View>
      </ScrollView>

      <Sheet visible={picker === "trade"} onClose={() => setPicker(null)} title="What's going on?">
        <View style={{ gap: 10 }}>
          {templates.map((t) => (
            <Pressable
              key={t.trade}
              accessibilityRole="button"
              onPress={() => {
                haptic.tap();
                start(t.trade);
              }}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.fillPressed }]}
            >
              <View style={styles.optionIcon}>
                <Icon name={t.icon} size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{t.title}</Text>
                <Text variant="caption" tone="soft">
                  {t.blurb}
                </Text>
              </View>
              {starting === t.trade ? <ActivityIndicator color={colors.ink} /> : <Icon name="chevron-right" size={20} color={colors.inkFaint} />}
            </Pressable>
          ))}
          {startError ? (
            <Text variant="caption" tone="danger" accessibilityRole="alert">
              {startError}
            </Text>
          ) : null}
        </View>
      </Sheet>

      <Sheet visible={picker === "home"} onClose={() => setPicker(null)} title="Your homes">
        <View style={{ gap: 10 }}>
          {homes.map((h) => (
            <Pressable
              key={h.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: h.id === home?.id }}
              onPress={() => {
                haptic.select();
                select(h.id);
                setPicker(null);
              }}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.fillPressed }]}
            >
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{h.name}</Text>
                <Text variant="caption" tone="soft">
                  {h.address}
                </Text>
              </View>
              {h.id === home?.id ? <Icon name="check" size={20} color={colors.accent} /> : null}
            </Pressable>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  homePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.fill,
  },
  hero: { paddingTop: 28, paddingBottom: 40 },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    marginBottom: 10,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
});
