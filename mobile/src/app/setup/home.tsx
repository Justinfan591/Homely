import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSWRConfig } from "swr";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Controls";
import { AddressField } from "@/components/AddressField";
import { Icon } from "@/components/Icon";
import { Screen, Title } from "@/components/Screen";
import { Text } from "@/components/Text";
import { HOME_TYPES } from "@/domain/types";
import { useProfile } from "@/hooks/data";
import { api } from "@/services";
import { currentAddress } from "@/services/location";
import { colors } from "@/theme";

/**
 * Sign up · your home. Asks for the phone's location and fills in the address (they can still edit it).
 * The server geocodes the address so pros nearby can be matched.
 */
export default function SetupHome() {
  const { data: profile } = useProfile();
  const { mutate } = useSWRConfig();
  const [address, setAddress] = useState<string | null>(null);
  // Where the address is, when it came from a suggestion or the phone's location (else the server looks it up).
  const [at, setAt] = useState<{ lat: number; lng: number } | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const where = address ?? profile?.address ?? "";
  const kind = type ?? profile?.homeType ?? "Apartment";
  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState<{ text: string; settings?: boolean } | null>(null);
  const asked = useRef(false);
  /** What's in the field right now, for the location lookup that finishes later. */
  const typed = useRef("");

  /** `manual`: they tapped "Use my current location", so replace what's there. The automatic ask only fills an empty field. */
  async function locate(manual = false) {
    setLocating(true);
    setLocateNote(null);
    const r = await currentAddress();
    setLocating(false);
    if ("address" in r) {
      if (manual || !typed.current.trim()) {
        typed.current = r.address;
        setAddress(r.address);
        setAt({ lat: r.lat, lng: r.lng });
      }
    } else if (r.error === "blocked") {
      setLocateNote({ text: "Location is off for Scope. Turn it on in Settings, or type your address.", settings: true });
    } else {
      setLocateNote({ text: r.error === "denied" ? "No problem, type your address." : "We couldn't find your address. Type it instead." });
    }
  }

  // Once the profile has loaded: no saved address yet, so ask for the location straight away.
  useEffect(() => {
    if (profile === undefined || asked.current) return;
    asked.current = true;
    if (!profile?.address && !address) void locate();
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  async function done() {
    setBusy(true);
    setError(null);
    try {
      await mutate("profile", api.updateProfile({ address: where.trim(), homeType: kind, ...(at ?? {}) }), { revalidate: false });
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
        <AddressField
          label="Where"
          value={where}
          onChangeText={(t) => {
            typed.current = t;
            setAddress(t);
            setAt(null);
          }}
          onPick={(s) => {
            typed.current = s.address;
            setAddress(s.address);
            setAt({ lat: s.lat, lng: s.lng });
          }}
          placeholder={locating ? "Finding your address…" : "Street address, city"}
          style={{ marginTop: 36 }}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => (locateNote?.settings ? Linking.openSettings() : void locate(true))}
          disabled={locating}
          hitSlop={8}
          style={({ pressed }) => [styles.locate, (pressed || locating) && { opacity: 0.5 }]}
        >
          <Icon name="navigation" size={15} color={colors.inkSoft} />
          <Text variant="label" tone="soft">
            {locating ? "Finding your location…" : locateNote?.settings ? "Open settings" : "Use my current location"}
          </Text>
        </Pressable>
        {locateNote ? (
          <Text variant="caption" tone="soft" style={{ marginTop: 6 }}>
            {locateNote.text}
          </Text>
        ) : null}
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
  locate: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 12 },
});
