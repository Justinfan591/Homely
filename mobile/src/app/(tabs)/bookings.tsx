import { router } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Skeleton } from "@/components/Controls";
import { TradeArt } from "@/components/Design";
import { haptic } from "@/components/haptics";
import { EmptyState, ErrorState } from "@/components/States";
import { Text } from "@/components/Text";
import { shortDate, windowLabel } from "@/domain/format";
import type { RecordItem, RecordStatus } from "@/domain/types";
import { useRecord } from "@/hooks/data";
import { useHome } from "@/hooks/home";
import { getTemplate } from "@/templates";
import { tradeCategory } from "@/templates/art";
import { colors, gutter, radius, shadow } from "@/theme";
import { usePullToRefresh } from "@/components/Screen";

const PAST: RecordStatus[] = ["done", "cancelled", "declined"];

const BADGE: Record<RecordStatus, string> = {
  in_progress: "Draft",
  needs_info: "Needs more",
  offers: "Quotes in",
  awaiting: "Waiting",
  scheduled: "Confirmed",
  en_route: "On the way",
  done: "Done",
  handoff: "In review",
  declined: "Unavailable",
  cancelled: "Cancelled",
};

/** Client · bookings */
export default function Bookings() {
  const insets = useSafeAreaInsets();
  const { home } = useHome();
  const record = useRecord(home?.id);
  const pull = usePullToRefresh(() => record.mutate());
  const items = record.data ?? [];
  const upcoming = items.filter((i) => !PAST.includes(i.status));
  const past = items.filter((i) => PAST.includes(i.status));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 32, paddingHorizontal: gutter, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl {...pull} />}
    >
      <Text variant="display" accessibilityRole="header">
        Bookings
      </Text>

      {record.error && !record.data ? (
        <ErrorState message={record.error.message} onRetry={() => record.mutate()} />
      ) : !record.data ? (
        <View style={{ gap: 10, marginTop: 28 }}>
          <Skeleton height={96} radius={radius.lg} />
          <Skeleton height={96} radius={radius.lg} />
        </View>
      ) : !items.length ? (
        <EmptyState icon="calendar" title="No bookings yet" body="When you book a pro, it shows up here." />
      ) : (
        <>
          {upcoming.length ? (
            <>
              <Text variant="label" tone="soft" style={styles.section}>
                Upcoming
              </Text>
              <View style={{ gap: 10 }}>
                {upcoming.map((i) => (
                  <Row key={i.id} item={i} />
                ))}
              </View>
            </>
          ) : null}
          {past.length ? (
            <>
              <Text variant="label" tone="soft" style={styles.section}>
                Past
              </Text>
              <View style={[styles.pastCard, shadow]}>
                {past.map((i, n) => (
                  <PastRow key={i.id} item={i} last={n === past.length - 1} />
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function open(item: RecordItem) {
  haptic.tap();
  router.push(item.href as never);
}

function Row({ item }: { item: RecordItem }) {
  const when = item.slot ? windowLabel(item.slot.start) : getTemplate(item.trade).title;
  const who = item.providerName ?? (item.status === "offers" ? `${item.offerCount} quotes` : item.title);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${when}, ${who}, ${BADGE[item.status]}`}
      onPress={() => open(item)}
      style={({ pressed }) => [styles.row, shadow, pressed && { backgroundColor: colors.fillPressed }]}
    >
      <TradeArt trade={item.trade} size={56} />
      <View style={{ flex: 1 }}>
        <Text variant="option" numberOfLines={1}>
          {when}
        </Text>
        <Text variant="caption" tone="soft" numberOfLines={1} style={{ marginTop: 2 }}>
          {who}
        </Text>
      </View>
      <View style={styles.badge}>
        <Text variant="caption" style={{ fontSize: 13 }}>
          {BADGE[item.status]}
        </Text>
      </View>
    </Pressable>
  );
}

function PastRow({ item, last }: { item: RecordItem; last: boolean }) {
  const t = getTemplate(item.trade);
  const canRate = item.status === "done" && item.rating == null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${tradeCategory(item.trade, t.title)}, ${item.title}${canRate ? ", rate it" : ""}`}
      onPress={() => (canRate ? (haptic.tap(), router.push(`/review/${item.id}`)) : open(item))}
      style={({ pressed }) => [styles.pastRow, !last && styles.rule, pressed && { opacity: 0.6 }]}
    >
      <TradeArt trade={item.trade} size={44} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {tradeCategory(item.trade, t.title)}
        </Text>
        <Text variant="caption" tone="soft" numberOfLines={1}>
          {item.title}
        </Text>
      </View>
      {canRate ? (
        <View style={[styles.badge, { backgroundColor: colors.ink }]}>
          <Text variant="caption" tone="white" style={{ fontSize: 13 }}>
            Rate
          </Text>
        </View>
      ) : (
        <Text variant="caption" tone="soft">
          {item.status === "cancelled" ? "Cancelled" : shortDate(item.slot?.start ?? item.createdAt)}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 28, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: radius.lg, backgroundColor: colors.card },
  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.bg },
  pastCard: { borderRadius: radius.lg, backgroundColor: colors.card, paddingHorizontal: 16 },
  pastRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  rule: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});
