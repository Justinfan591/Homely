import { Redirect, router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { TradeArt } from "@/components/Design";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { useHome } from "@/hooks/home";
import { intake } from "@/hooks/intake";
import { api } from "@/services";
import { tradeCategory } from "@/templates/art";

/** Tell us · is this right? */
export default function Confirm() {
  const { home } = useHome();
  const result = intake.result;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!result) return <Redirect href="/tell/pick" />;

  async function yes() {
    if (!home || !result) return;
    setBusy(true);
    setError(null);
    try {
      const scan = await api.createScan(home.id, result.trade, intake.text || null);
      // Drop the "Tell us" screens so leaving the scan returns to the tabs.
      router.dismissAll();
      router.push(`/scan/${scan.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start. Try again.");
      setBusy(false);
    }
  }

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
          <Button label="Yes, that's it" onPress={yes} loading={busy} disabled={!home} />
          <Button label="Not quite" variant="ghost" onPress={() => router.push("/tell/pick")} disabled={busy} />
        </>
      }
    >
      <View style={styles.center}>
        <TradeArt trade={result.trade} size={260} float />
        <Text variant="label" tone="soft" style={{ marginTop: 8 }}>
          It sounds like
        </Text>
        <Text variant="hero" style={{ fontSize: 48, lineHeight: 50, marginTop: 6, textAlign: "center" }} accessibilityRole="header">
          {tradeCategory(result.trade, result.label)}
        </Text>
        <Text tone="mid" style={{ marginTop: 14, maxWidth: 290, textAlign: "center" }}>
          {result.summary}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
