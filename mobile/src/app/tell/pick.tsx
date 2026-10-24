import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { TradeArt } from "@/components/Design";
import { haptic } from "@/components/haptics";
import { Screen, Title } from "@/components/Screen";
import { Text } from "@/components/Text";
import { useHome } from "@/hooks/home";
import { startFromIntake } from "@/hooks/intake";
import { templates } from "@/templates";
import { tradeCategory } from "@/templates/art";
import { colors, radius, shadow } from "@/theme";

/** Tell us · "Something else": every category. Keeps what they said or the photo they took. */
export default function Pick() {
  const { home } = useHome();
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(trade: string) {
    if (!home || starting) return;
    haptic.tap();
    setStarting(trade);
    setError(null);
    try {
      await startFromIntake(home.id, trade);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start. Try again.");
      setStarting(null);
    }
  }

  return (
    <Screen>
      <View style={{ marginTop: 16, marginBottom: 28 }}>
        <Title title="What's closest?" />
      </View>
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
            disabled={!!starting}
            onPress={() => pick(t.trade)}
            style={({ pressed }) => [styles.tile, shadow, pressed && { backgroundColor: colors.fillPressed }]}
          >
            <TradeArt trade={t.trade} size={92} />
            {starting === t.trade ? <ActivityIndicator color={colors.ink} /> : <Text variant="bodyStrong">{tradeCategory(t.trade, t.title)}</Text>}
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    width: "47%",
    flexGrow: 1,
    height: 150,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
