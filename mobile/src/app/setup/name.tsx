import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useSWRConfig } from "swr";
import { Button } from "@/components/Button";
import { Field } from "@/components/Design";
import { Screen, Title } from "@/components/Screen";
import { Text } from "@/components/Text";
import { useProfile } from "@/hooks/data";
import { api } from "@/services";

/** Sign up · name */
export default function SetupName() {
  const { data: profile } = useProfile();
  const { mutate } = useSWRConfig();
  const [first, setFirst] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from a sign-up that was interrupted after this step.
  const [savedFirst = "", ...savedRest] = (profile?.name ?? "").split(" ");
  const f = first ?? savedFirst;
  const l = last ?? savedRest.join(" ");

  async function next() {
    setBusy(true);
    setError(null);
    try {
      await mutate("profile", api.updateProfile({ name: `${f.trim()} ${l.trim()}`.trim() }), { revalidate: false });
      router.push("/setup/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        onBack={() => api.signOut()}
        footer={
          <>
            {error ? (
              <Text variant="caption" tone="danger" style={{ textAlign: "center" }} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <Button label="Continue" onPress={next} disabled={!f.trim()} loading={busy} />
          </>
        }
      >
        <View style={{ marginTop: 36 }}>
          <Title title="What should we call you?" />
        </View>
        <View style={{ gap: 20, marginTop: 36 }}>
          <Field label="First name" value={f} onChangeText={setFirst} autoFocus autoComplete="given-name" textContentType="givenName" returnKeyType="next" />
          <Field label="Last name" value={l} onChangeText={setLast} autoComplete="family-name" textContentType="familyName" returnKeyType="done" onSubmitEditing={() => f.trim() && next()} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
