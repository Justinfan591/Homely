import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { moneyRange, shortDate } from "@/domain/format";
import type { RecordItem, RecordStatus } from "@/domain/types";
import { getTemplate } from "@/templates";
import { colors, radius } from "@/theme";
import { Pill } from "./Controls";
import { haptic } from "./haptics";
import { Icon } from "./Icon";
import { Text } from "./Text";

const STATUS: Record<RecordStatus, { label: string; tone: "neutral" | "accent" | "success" | "warn" }> = {
  in_progress: { label: "Draft", tone: "neutral" },
  needs_info: { label: "Pro needs more", tone: "accent" },
  offers: { label: "Offers in — pick one", tone: "accent" },
  awaiting: { label: "Awaiting confirmation", tone: "warn" },
  scheduled: { label: "Scheduled", tone: "accent" },
  en_route: { label: "On the way", tone: "accent" },
  done: { label: "Completed", tone: "success" },
  handoff: { label: "In review", tone: "neutral" },
  declined: { label: "Pick another pro", tone: "warn" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function RecordRow({ item }: { item: RecordItem }) {
  const template = getTemplate(item.trade);
  const status =
    item.status === "offers" && item.offerCount
      ? { ...STATUS.offers, label: `${item.offerCount} ${item.offerCount === 1 ? "offer" : "offers"} — pick one` }
      : STATUS[item.status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${template.title}, ${status.label}`}
      onPress={() => {
        haptic.tap();
        router.push(item.href as never);
      }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fillPressed }]}
    >
      <View style={styles.thumb}>
        {item.photoUri ? (
          <Image source={{ uri: item.photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Icon name={template.icon} size={22} color={colors.inkSoft} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {template.title}
        </Text>
        <Text variant="caption" tone="soft" numberOfLines={1}>
          {shortDate(item.createdAt)}
          {item.price ? ` · ${moneyRange(item.price)}` : ""}
        </Text>
        <View style={{ marginTop: 6 }}>
          <Pill label={status.label} tone={status.tone} />
        </View>
      </View>
      <Icon name="chevron-right" size={20} color={colors.inkFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
