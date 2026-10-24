import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Button } from "@/components/Button";
import { Field } from "@/components/Design";
import { Screen, Title } from "@/components/Screen";
import { Text } from "@/components/Text";
import { api } from "@/services";

/** Phone or email, before the code. */
export default function Contact() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const email = mode === "email";
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = email ? /\S+@\S+\.\S+/.test(value) : value.replace(/\D/g, "").length >= 7;

  async function next() {
    setBusy(true);
    setError(null);
    try {
      const contact = value.trim();
      const res = await api.startSignIn(contact);
      router.push({ pathname: "/code", params: { contact, sentTo: res.sentTo, length: String(res.length) } });
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
            <Button label="Continue" onPress={next} disabled={!ready} loading={busy} />
          </>
        }
      >
        <View style={{ marginTop: 36 }}>
          <Title title={email ? "What's your email?" : "What's your number?"} sub="We'll send you a code to sign in." />
        </View>
        <Field
          label={email ? "Email" : "Phone number"}
          icon={email ? "mail" : "phone"}
          value={value}
          onChangeText={setValue}
          placeholder={email ? "you@example.com" : "(555) 555-0142"}
          keyboardType={email ? "email-address" : "phone-pad"}
          autoCapitalize="none"
          autoComplete={email ? "email" : "tel"}
          textContentType={email ? "emailAddress" : "telephoneNumber"}
          autoFocus
          returnKeyType="next"
          onSubmitEditing={() => ready && next()}
          style={{ marginTop: 36 }}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
