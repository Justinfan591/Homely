import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Button } from "@/components/Button";
import { CodeInput } from "@/components/Design";
import { haptic } from "@/components/haptics";
import { Screen, Title } from "@/components/Screen";
import { Text } from "@/components/Text";
import { api } from "@/services";

/**
 * Sign up · code. The demo sends nothing: the code is always 7246 (the server's DEMO_LOGIN_CODE).
 * Signing in switches the app to the tabs; Home sends new accounts on to their name and home.
 */
export default function Code() {
  const { contact = "", sentTo, length: len } = useLocalSearchParams<{ contact: string; sentTo?: string; length?: string }>();
  const length = Number(len) || 4;
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify(value = code) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.verifyCode(contact, value);
      haptic.success();
    } catch (e) {
      haptic.warning();
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
      setCode("");
      setBusy(false);
    }
  }

  // Go as soon as the last digit is in.
  useEffect(() => {
    if (code.length === length) void verify(code);
  }, [code, length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen footer={<Button label="Continue" onPress={() => verify()} disabled={code.length < length} loading={busy} />}>
        <View style={{ marginTop: 36 }}>
          <Title title="Enter the code" sub={`We sent a ${length}-digit code to ${sentTo ?? contact}.`} />
        </View>
        <View style={{ marginTop: 36 }}>
          <CodeInput value={code} onChange={setCode} length={length} />
        </View>
        {error ? (
          <Text variant="label" tone="danger" style={{ marginTop: 20 }} accessibilityRole="alert">
            {error}
          </Text>
        ) : (
          <Text variant="label" tone="soft" style={{ marginTop: 20 }}>
            Demo: the code is 7246.
          </Text>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
