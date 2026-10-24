import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Star } from "@/components/Controls";
import { Avatar } from "@/components/Design";
import { haptic } from "@/components/haptics";
import { goHome, Screen, Title } from "@/components/Screen";
import { Text } from "@/components/Text";
import { money, shortDay, windowLabel } from "@/domain/format";
import type { Offer } from "@/domain/types";
import { useJob } from "@/hooks/data";
import { api } from "@/services";
import { colors, radius, shadow } from "@/theme";

/** Quotes. Cheapest first; more pop in while pros are still answering. Tap one to book it. */
export default function Quotes() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { data: job, mutate } = useJob(jobId);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Booked (here or elsewhere) or withdrawn: show the booking instead.
  useEffect(() => {
    if (job && job.status !== "collecting" && !accepting) router.replace(`/booking/${jobId}`);
  }, [job, accepting, jobId]);

  const offers = job?.offers ?? [];
  const waitingOn = Math.max(0, (job?.invitedCount ?? 0) - (job?.passedCount ?? 0) - offers.length);

  async function accept(o: Offer) {
    if (accepting) return;
    haptic.tap();
    setAccepting(o.id);
    setError(null);
    try {
      await api.acceptOffer(jobId, o.id);
      haptic.success();
      router.replace(`/booked/${jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't book that one. Try another.");
      setAccepting(null);
      void mutate();
    }
  }

  const sub = job ? [job.title, job.slot ? windowLabel(job.slot.start) : null].filter(Boolean).join(" · ") : "";

  return (
    <Screen onBack={goHome}>
      <View style={{ marginTop: 16 }}>
        <Title
          title={offers.length ? `${offers.length} ${offers.length === 1 ? "quote" : "quotes"} for you` : "Waiting for quotes"}
          sub={sub}
          size="title"
        />
      </View>
      {error ? (
        <Text variant="caption" tone="danger" style={{ marginTop: 16 }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={{ gap: 12, marginTop: 32 }}>
        {offers.map((o) => (
          <Animated.View key={o.id} entering={FadeInDown.duration(320)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${o.provider.name}, ${o.provider.rating.toFixed(1)} stars, ${money(o.price)}, ${o.slot.label}. Book`}
              disabled={!!accepting}
              onPress={() => accept(o)}
              style={({ pressed }) => [styles.card, shadow, pressed && { backgroundColor: colors.fillPressed }, accepting && accepting !== o.id && { opacity: 0.5 }]}
            >
              <Avatar name={o.provider.name} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="option" numberOfLines={1}>
                  {o.provider.name}
                </Text>
                <View style={styles.rating}>
                  <Star size={14} />
                  <Text variant="caption" tone="soft">
                    {o.provider.rating.toFixed(1)} · {o.provider.reviews} reviews
                  </Text>
                </View>
              </View>
              {accepting === o.id ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <View style={{ alignItems: "flex-end" }}>
                  <Text variant="title" style={{ fontSize: 24, lineHeight: 28 }}>
                    {money(o.price)}
                  </Text>
                  <Text variant="caption" tone="soft" style={{ marginTop: 2 }}>
                    {shortDay(o.slot.start)}
                  </Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
        ))}
      </View>
      {waitingOn > 0 ? (
        <Text variant="caption" tone="soft" style={{ textAlign: "center", marginTop: 20 }}>
          Waiting on {waitingOn} more {waitingOn === 1 ? "pro" : "pros"}…
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 18, paddingHorizontal: 20, borderRadius: radius.lg, backgroundColor: colors.card },
  rating: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
});
