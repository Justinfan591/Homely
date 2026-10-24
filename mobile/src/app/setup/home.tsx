import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { useSWRConfig } from "swr";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Controls";
import { Field } from "@/components/Design";
import { Screen, Title } from "@/components/Screen";
import { Text } from "@/components/Text";
import { HOME_TYPES } from "@/domain/types";
import { useProfile } from "@/hooks/data";
import { api } from "@/services";

/** Sign up · your home. The server geocodes the address so pros nearby can be matched. */
export default function SetupHome() {
  const { data: profile } = useProfile();
  const { mutate } = useSWRConfig();
  const [address, setAddress] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const where = address ?? profile?.address ?? "";
  const kind = type ?? profile?.homeType ?? "Apartment";

  async function done() {
    setBusy(true);
    setError(null);
    try {
      await mutate("profile", api.updateProfile({ address: where.trim(), homeType: kind }), { revalidate: false });
      await mutate("homes");
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
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
            <Button label="Get started" onPress={done} disabled={!where.trim()} loading={busy} />
          </>
        }
      >
        <View style={{ marginTop: 36 }}>
          <Title title="Tell us about your home" sub="So pros come prepared." />
        </View>
        <Field
          label="Where"
          icon="map-pin"
          value={where}
          onChangeText={setAddress}
          placeholder="Street address, city"
          autoComplete="street-address"
          textContentType="fullStreetAddress"
          style={{ marginTop: 36 }}
        />
        <Text variant="label" tone="soft" style={{ marginTop: 28, marginBottom: 12 }}>
          Type of home
        </Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {HOME_TYPES.map((t) => (
            <Chip key={t} label={t} selected={kind === t} onPress={() => setType(t)} />
          ))}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
