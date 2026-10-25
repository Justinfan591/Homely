import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { CameraPanel, pickFromLibrary, Shutter, useCamera } from "@/components/CameraPanel";
import { goHome, Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { intake } from "@/hooks/intake";
import { api } from "@/services";

/** Show us: one photo, and the AI suggests what's wrong. The photo is reused as the first guided shot. */
export default function ScreeningPhoto() {
  const camera = useCamera();
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function classify(photoUri: string) {
    setBusy(true);
    setError(null);
    setUri(photoUri);
    try {
      intake.source = "photo";
      intake.photoUri = photoUri;
      // The camera path: the photo alone is enough for the AI to suggest what's wrong.
      intake.text = "";
      intake.result = await api.classify("", photoUri);
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
        <Shutter onPress={take} disabled={busy || !camera.granted} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { alignItems: "center", justifyContent: "center", height: 88, marginTop: 20, marginBottom: 32 },
});
