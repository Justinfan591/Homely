import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Button } from "@/components/Button";
import { Field, NoteBox } from "@/components/Design";
import { goBackOrHome, Screen, Title } from "@/components/Screen";
import { Text } from "@/components/Text";
import { useScan } from "@/hooks/data";
import { api } from "@/services";
import { getTemplate } from "@/templates";

/** "No photos, but you suspect mold?": symptoms and where, instead of the guided photos. */
export default function DescribeInstead() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const { data: scan } = useScan(scanId);
  const [symptoms, setSymptoms] = useState("");
  const [where, setWhere] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = scan ? getTemplate(scan.trade).noPhotos : undefined;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.describeInstead(scanId, [`Symptoms: ${symptoms.trim()}`, where.trim() ? `Where: ${where.trim()}` : ""].filter(Boolean).join("\n"));
      router.replace(`/questions/${scanId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that. Try again.");
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        onBack={goBackOrHome}
        footer={
          <>
            {error ? (
              <Text variant="caption" tone="danger" style={{ textAlign: "center" }} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <Button label="Continue" onPress={send} loading={busy} disabled={symptoms.trim().length < 3} />
          </>
        }
      >
        <View style={{ marginTop: 16 }}>
          <Title title={copy?.title ?? "Can't see it?"} sub={copy?.prompt} size="title" />
        </View>
        <Text variant="label" tone="soft" style={{ marginTop: 28, marginBottom: 8 }}>
          Symptoms
        </Text>
        <NoteBox
          value={symptoms}
          onChangeText={setSymptoms}
          placeholder="A musty smell, stains that keep coming back, coughing at home…"
          accessibilityLabel="Symptoms"
        />
        <Field
          label="Where you think it is"
          value={where}
          onChangeText={setWhere}
          placeholder="Basement, behind the shower wall…"
          maxLength={200}
          style={{ marginTop: 20 }}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
