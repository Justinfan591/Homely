import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Button } from "@/components/Button";
import { NoteBox } from "@/components/Design";
import { Screen, Title } from "@/components/Screen";
import { Text } from "@/components/Text";
import { intake } from "@/hooks/intake";
import { api } from "@/services";

/** "Other" on the service grid: type the problem, Claude picks the trade, then "Is this right?". */
export default function DescribeIssue() {
  const [text, setText] = useState(intake.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      intake.text = text.trim();
      intake.photoUri = null;
      intake.result = await api.classify(intake.text, null);
      router.push("/tell/confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        footer={
          <>
            {error ? (
              <Text variant="caption" tone="danger" style={{ textAlign: "center" }} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <Button label="Continue" onPress={send} loading={busy} disabled={text.trim().length < 3} />
          </>
        }
      >
        <View style={{ marginTop: 16, marginBottom: 28 }}>
          <Title title="Describe your issue." sub="We'll match you to a professional." />
        </View>
        <NoteBox
          value={text}
          onChangeText={setText}
          placeholder="What's wrong, where it is, and since when"
          accessibilityLabel="Describe your issue"
          autoFocus
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
