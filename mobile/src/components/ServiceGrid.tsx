import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { TradeArt, useScale } from "@/components/Design";
import { haptic } from "@/components/haptics";
import { Icon } from "@/components/Icon";
import { Text } from "@/components/Text";
import { useHome } from "@/hooks/home";
import { resetIntake, startFromIntake } from "@/hooks/intake";
import { templates } from "@/templates";
import { tradeCategory } from "@/templates/art";
import { colors, radius, shadow } from "@/theme";

/**
 * The service tiles (Home and "What's closest?"). A tile starts that trade's scan; "Other" is "Type it".
 * `fresh` (Home): start from nothing. Otherwise what they said or the photo they took comes along.
 */
export function ServiceGrid({ fresh }: { fresh?: boolean }) {
  const { home } = useHome();
  const k = useScale();
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(trade: string) {
    if (!home || starting) return;
    haptic.tap();
    setStarting(trade);
    setError(null);
    try {
      if (fresh) resetIntake("type");
      await startFromIntake(home.id, trade);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start. Try again.");
    } finally {
      setStarting(null);
    }
  }

  function other() {
    haptic.tap();
    if (fresh) resetIntake("type");
    router.push("/tell/type");
  }

  const tile = [styles.tile, shadow, { height: 132 * k }];
  return (
    <View>
      {error ? (
        <Text variant="caption" tone="danger" style={{ marginBottom: 12 }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.grid}>
        {templates.map((t) => (
          <Pressable
            key={t.trade}
            accessibilityRole="button"
            accessibilityLabel={tradeCategory(t.trade, t.title)}
            disabled={!home || !!starting}
            onPress={() => pick(t.trade)}
            style={({ pressed }) => [tile, pressed && { backgroundColor: colors.fillPressed }]}
          >
            <TradeArt trade={t.trade} size={80 * k} />
            {starting === t.trade ? <ActivityIndicator color={colors.ink} /> : <Text variant="bodyStrong">{tradeCategory(t.trade, t.title)}</Text>}
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Other: describe your issue"
          disabled={!!starting}
          onPress={other}
          style={({ pressed }) => [tile, pressed && { backgroundColor: colors.fillPressed }]}
        >
          <View style={{ width: 80 * k, height: 80 * k, alignItems: "center", justifyContent: "center" }}>
            <Icon name="more-horizontal" size={44 * k} color={colors.inkSoft} />
          </View>
          <Text variant="bodyStrong">Other</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    width: "47%",
    flexGrow: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
