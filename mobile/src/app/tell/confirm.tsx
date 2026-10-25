import { Redirect, router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { TradeArt } from "@/components/Design";
import { haptic } from "@/components/haptics";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { useHome } from "@/hooks/home";
import { intake, startFromIntake } from "@/hooks/intake";
import { tradeCategory } from "@/templates/art";
import { colors, radius, shadow } from "@/theme";

/**
 * Tell us · is this right? The AI's best guess with one big "Yes", its two next guesses as one-tap
 * chips, and "Not quite" for the full grid. Whichever they tap starts the guided photos.
 */
export default function Confirm() {
  const { home } = useHome();
  const result = intake.result;
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!result) return <Redirect href="/tell/pick" />;

  async function start(trade: string) {
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

  // Worded for how they told us: typed, said or showed.
  const lead = intake.photoUri || intake.source === "photo" ? "It looks like" : intake.source === "type" ? "It reads like" : "It sounds like";
  const busy = starting != null;

  return (
    <Screen
      title="Is this right?"
      scroll={false}
      footer={
        <>
          {error ? (
            <Text variant="caption" tone="danger" style={{ textAlign: "center" }} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            label={starting === result.trade ? "Getting things ready…" : "Yes, that's it"}
            onPress={() => start(result.trade)}
            loading={starting === result.trade}
            disabled={!home || (busy && starting !== result.trade)}
          />
        </>
      }
    >
      <View style={styles.center}>
        <TradeArt trade={result.trade} size={220} float />
        <Text variant="label" tone="soft" style={{ marginTop: 4 }}>
          {lead}
        </Text>
        <Text variant="hero" style={{ fontSize: 48, lineHeight: 50, marginTop: 6, textAlign: "center" }} accessibilityRole="header">
          {tradeCategory(result.trade, result.label)}
        </Text>
        <Text tone="mid" style={{ marginTop: 12, maxWidth: 300, textAlign: "center" }}>
          {result.summary}
        </Text>
      </View>

      {result.alternatives.length ? (
        <View style={{ marginBottom: 8 }}>
          <Text variant="label" tone="soft" style={{ textAlign: "center", marginBottom: 10 }}>
            Or is it…
          </Text>
          <View style={styles.alts}>
            {result.alternatives.map((a) => (
              <Pressable
                key={a.trade}
                accessibilityRole="button"
                accessibilityLabel={`It's ${tradeCategory(a.trade, a.label)}`}
                disabled={busy || !home}
                onPress={() => start(a.trade)}
                style={({ pressed }) => [styles.alt, shadow, pressed && { backgroundColor: colors.fillPressed }, busy && starting !== a.trade && { opacity: 0.5 }]}
              >
                <TradeArt trade={a.trade} size={44} />
                {starting === a.trade ? (
                  <ActivityIndicator color={colors.ink} />
                ) : (
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {tradeCategory(a.trade, a.label)}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
          <Button label="Not quite" variant="ghost" onPress={() => router.push("/tell/pick")} disabled={busy} />
        </View>
      ) : (
        <Button label="Not quite" variant="ghost" onPress={() => router.push("/tell/pick")} disabled={busy} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  alts: { flexDirection: "row", gap: 10 },
  alt: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 64,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
});
