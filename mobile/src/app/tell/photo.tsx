import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { CameraPanel, pickFromLibrary, Shutter, useCamera } from "@/components/CameraPanel";
import { goHome, Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { intake } from "@/hooks/intake";
import { api } from "@/services";

/** Tell us · screening photo. One photo, then Claude picks the trade from it and what they said. */
export default function ScreeningPhoto() {
  const camera = useCamera();
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function classify(photoUri: string | null) {
    setBusy(true);
    setError(null);
    setUri(photoUri);
    try {
      intake.photoUri = photoUri;
      intake.result = await api.classify(intake.text, photoUri);
      router.replace("/tell/confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setUri(null);
      setBusy(false);
    }
  }

  async function take() {
    try {
      const shot = await camera.snap();
      if (shot) await classify(shot);
    } catch {
      setError("Couldn't take the photo. Try again.");
    }
  }

  async function library() {
    const picked = await pickFromLibrary();
    if (picked) await classify(picked);
  }

  return (
    <Screen title="Show us" onBack={goHome} scroll={false}>
      <CameraPanel camera={camera} previewUri={uri} status={busy ? { text: "Looking…" } : null} onLibrary={busy ? undefined : library} />
      <View style={{ marginTop: 28, minHeight: 96 }}>
        <Text variant="title">Point it at the problem</Text>
        <Text tone={error ? "danger" : "soft"} style={{ marginTop: 8 }} accessibilityLiveRegion="polite">
          {error ?? "One photo helps us pick the right pro."}
        </Text>
      </View>
      <View style={styles.controls}>
        <View style={styles.side}>
          <Pressable accessibilityRole="button" onPress={() => classify(null)} disabled={busy} hitSlop={8}>
            <Text variant="label" tone="soft" style={{ fontSize: 15 }}>
              Skip
            </Text>
          </Pressable>
        </View>
        <Shutter onPress={take} disabled={busy || !camera.granted} />
        <View style={styles.side} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 88, marginTop: 20, marginBottom: 32 },
  side: { width: 96 },
});
