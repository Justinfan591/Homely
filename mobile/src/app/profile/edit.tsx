import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { useSWRConfig } from "swr";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Controls";
import { AddressField } from "@/components/AddressField";
import { Field } from "@/components/Design";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { HOME_TYPES, type Profile } from "@/domain/types";
import { useProfile } from "@/hooks/data";
import { api } from "@/services";

/** Profile · edit */
export default function EditProfile() {
  const { data } = useProfile();
  if (!data) return <Screen title="Edit profile">{null}</Screen>;
  return <Form profile={data} />;
}

function Form({ profile }: { profile: Profile }) {
  const { mutate } = useSWRConfig();
  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(profile.age ? String(profile.age) : "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [at, setAt] = useState<{ lat: number; lng: number } | null>(null);
  const [homeType, setHomeType] = useState(profile.homeType ?? "Apartment");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ageNum = age.trim() ? Number(age) : null;
  const ageOk = ageNum === null || (Number.isInteger(ageNum) && ageNum >= 13 && ageNum <= 120);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await mutate("profile", api.updateProfile({ name: name.trim(), age: ageNum, address: address.trim(), homeType, ...(at ?? {}) }), { revalidate: false });
      await mutate("homes");
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        title="Edit profile"
        footer={
          <>
            {error ? (
              <Text variant="caption" tone="danger" style={{ textAlign: "center" }} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <Button label="Save" onPress={save} disabled={!name.trim() || !address.trim() || !ageOk} loading={busy} />
          </>
        }
      >
        <View style={{ gap: 20, marginTop: 16 }}>
          <Field label="Name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
          <Field label="Age" value={age} onChangeText={(t) => setAge(t.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" placeholder="Optional" />
          {!ageOk ? (
            <Text variant="caption" tone="danger" style={{ marginTop: -12 }}>
              Enter an age between 13 and 120.
            </Text>
          ) : null}
          <AddressField
            label="Address"
            value={address}
            onChangeText={(t) => {
              setAddress(t);
              setAt(null);
            }}
            onPick={(s) => {
              setAddress(s.address);
              setAt({ lat: s.lat, lng: s.lng });
            }}
            placeholder="Street address, city"
          />
        </View>
        <Text variant="label" tone="soft" style={{ marginTop: 28, marginBottom: 12 }}>
          Type of home
        </Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {HOME_TYPES.map((t) => (
            <Chip key={t} label={t} selected={homeType === t} onPress={() => setHomeType(t)} />
          ))}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
