import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Button } from "@/components/Button";
import { NoteBox } from "@/components/Design";
import { haptic } from "@/components/haptics";
import { goHome, Screen, Title } from "@/components/Screen";
import { Text } from "@/components/Text";
import { intake } from "@/hooks/intake";
import { api } from "@/services";

/** Type it: the homeowner writes what's wrong, and the AI suggests the problem on "Is this right?". */
export default function TypeIt() {
  const [text, setText] = useState(intake.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function next() {
    const said = text.trim();
    if (!said || busy) return;
    haptic.tap();
    setBusy(true);
    setError(null);
    try {
      intake.source = "type";
      intake.text = said;
      intake.photoUri = null;
      intake.result = await api.classify(said, null);
      router.replace("/tell/confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        onBack={goHome}
        footer={
          <>
            {error ? (
              <Text variant="caption" tone="danger" style={{ textAlign: "center" }} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <Button label={busy ? "Working out what's wrong…" : "Continue"} onPress={next} disabled={!text.trim()} loading={busy} />
          </>
        }
      >
        <View style={{ marginTop: 40 }}>
          <Title title="What's wrong?" sub="What you see, and where." />
        </View>
        <View style={{ marginTop: 32 }}>
          <NoteBox
            value={text}
            onChangeText={setText}
            placeholder="e.g. The kitchen sink is dripping under the cabinet"
            accessibilityLabel="What's wrong?"
            maxLength={1000}
            autoFocus
          />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
