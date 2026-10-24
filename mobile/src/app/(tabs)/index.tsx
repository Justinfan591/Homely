import { Redirect, router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Avatar, TradeArt } from "@/components/Design";
import { haptic } from "@/components/haptics";
import { ServiceGrid } from "@/components/ServiceGrid";
import { Text } from "@/components/Text";
import { windowLabel } from "@/domain/format";
import type { RecordItem } from "@/domain/types";
import { useProfile, useRecord } from "@/hooks/data";
import { useHome } from "@/hooks/home";
import { resetIntake } from "@/hooks/intake";
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

  function tell() {
    haptic.tap();
    resetIntake();
    router.push("/tell");
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 24, paddingHorizontal: gutter, paddingBottom: 24 }}>
      {next ? (
        <Animated.View entering={FadeIn.duration(300)}>
          <Text variant="display" accessibilityRole="header">
            Up next
          </Text>
          <UpNext item={next} />
        </Animated.View>
      ) : null}
      <Text variant={next ? "title" : "hero"} accessibilityRole="header" style={{ marginBottom: 24 }} numberOfLines={1} adjustsFontSizeToFit>
        {next ? "Something else?" : "What needs fixing?"}
      </Text>
      <ServiceGrid description={null} />
      <Button label="Or tell us what's wrong" variant="secondary" icon="mic" onPress={tell} disabled={!home} style={{ marginTop: 20 }} />
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
  card: { marginTop: 24, marginBottom: 24, padding: 24, borderRadius: radius.xl, backgroundColor: colors.card, flexShrink: 1 },
  cardArt: { alignItems: "center", marginBottom: 8 },
  who: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
});
