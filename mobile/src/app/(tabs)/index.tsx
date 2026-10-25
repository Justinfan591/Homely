import { Redirect, router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArtPile, Avatar, TradeArt } from "@/components/Design";
import { haptic } from "@/components/haptics";
import { Icon } from "@/components/Icon";
import { Text } from "@/components/Text";
import { windowLabel } from "@/domain/format";
import type { RecordItem } from "@/domain/types";
import { useProfile, useRecord } from "@/hooks/data";
import { useHome } from "@/hooks/home";
import { resetIntake, type IntakeSource } from "@/hooks/intake";
import { colors, gutter, radius, shadow } from "@/theme";

/** What the "Up next" card shows first, most urgent first. */
const NEXT_ORDER: RecordItem["status"][] = ["needs_info", "offers", "en_route", "scheduled", "awaiting"];

/** Client · nothing booked / Client · booked home */
export default function Home() {
  const insets = useSafeAreaInsets();
  const { home } = useHome();
  const profile = useProfile();
  const record = useRecord(home?.id);

  // Sign-up isn't finished until we have a name and a home.
  if (profile.data && !profile.data.name.trim()) return <Redirect href="/setup/name" />;
  if (profile.data && !profile.data.address) return <Redirect href="/setup/home" />;

  const next = NEXT_ORDER.map((s) => record.data?.find((i) => i.status === s)).find(Boolean);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    await Promise.all([record.mutate(), profile.mutate()]).catch(() => {});
    setRefreshing(false);
  }

  /** Each button is one way in: type it, say it, or show it. All three end on "Is this right?". */
  function start(source: IntakeSource, href: Href) {
    haptic.tap();
    resetIntake(source);
    router.push(href);
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.ink} colors={[colors.ink]} />}
    >
      {next ? (
        <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1, paddingTop: 32 }}>
          <Text variant="display" accessibilityRole="header">
            Up next
          </Text>
          <UpNext item={next} />
        </Animated.View>
      ) : (
        <ArtPile style={{ marginHorizontal: -gutter }} />
      )}

      {next ? null : (
        <Text variant="hero" accessibilityRole="header" style={{ marginTop: 32, marginBottom: 28 }} numberOfLines={1} adjustsFontSizeToFit>
          What needs fixing?
        </Text>
      )}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Type it"
          disabled={!home}
          onPress={() => start("type", "/tell/type")}
          style={({ pressed }) => [styles.round, shadow, pressed && { backgroundColor: colors.fillPressed }]}
        >
          <Icon name="type" size={24} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={next ? "Something else? Tell us what's wrong" : "Tell us what's wrong"}
          disabled={!home}
          onPress={() => start("voice", "/tell")}
          style={({ pressed }) => [styles.tell, (pressed || !home) && { opacity: 0.8 }]}
        >
          <Icon name="mic" size={26} color={colors.white} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Snap a photo instead"
          disabled={!home}
          onPress={() => start("photo", "/tell/photo")}
          style={({ pressed }) => [styles.round, shadow, pressed && { backgroundColor: colors.fillPressed }]}
        >
          <Icon name="camera" size={24} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const LABEL: Partial<Record<RecordItem["status"], string>> = {
  needs_info: "Pro needs more",
  en_route: "On the way",
};

function UpNext({ item }: { item: RecordItem }) {
  const label =
    LABEL[item.status] ??
    (item.status === "offers"
      ? `${item.offerCount} ${item.offerCount === 1 ? "quote" : "quotes"} in`
      : item.status === "scheduled"
        ? "Confirmed"
        : item.href.startsWith("/finding")
          ? "Finding pros"
          : "Waiting to confirm");
  const when = item.slot ? windowLabel(item.slot.start) : item.title;
  const who = item.status === "needs_info" ? (item.followUp?.provider ?? item.providerName) : item.status === "offers" ? item.bestOffer?.provider : item.providerName;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${when}${who ? `, ${who}` : ""}`}
      onPress={() => {
        haptic.tap();
        router.push(item.href as never);
      }}
      style={({ pressed }) => [styles.card, shadow, pressed && { backgroundColor: colors.fillPressed }]}
    >
      <View style={styles.cardArt}>
        <TradeArt trade={item.trade} size={200} float />
      </View>
      <Text variant="label" tone="soft">
        {label}
      </Text>
      <Text variant="title" style={{ marginTop: 6 }} numberOfLines={2}>
        {when}
      </Text>
      {who ? (
        <View style={styles.who}>
          <Avatar name={who} size={28} />
          <Text variant="bodyStrong">{who}</Text>
        </View>
      ) : item.status === "needs_info" ? (
        <Text tone="soft" style={{ marginTop: 10 }} numberOfLines={2}>
          {item.followUp?.message}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingHorizontal: gutter },
  actions: { flexDirection: "row", gap: 20, marginBottom: 12 },
  tell: {
    flex: 1,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  round: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  card: { marginTop: 24, marginBottom: 24, padding: 24, borderRadius: radius.xl, backgroundColor: colors.card, flexShrink: 1 },
  cardArt: { alignItems: "center", marginBottom: 8 },
  who: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
});
