import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View, type GestureResponderEvent } from "react-native";
import { Button } from "@/components/Button";
import { haptic } from "@/components/haptics";
import { goHome, Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { markShot } from "@/domain/scan";
import { useScan } from "@/hooks/data";
import { api } from "@/services";
import { getTemplate } from "@/templates";
import { colors, radius } from "@/theme";

const clamp = (n: number) => Math.min(96, Math.max(4, n));

/** Capture · mark the photo. Drag the dot to where the problem is; the spec writer is told where. */
export default function Mark() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const { data: scan } = useScan(scanId);
  const [box, setBox] = useState({ w: 1, h: 1 });
  const [dot, setDot] = useState({ x: 62, y: 74 });
  const [moved, setMoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shotId = scan ? markShot(scan) : null;
  const photo = scan?.photos.find((p) => p.shotId === shotId);
  const what = scan?.trade === "plumbing_sink" ? "the leak" : "the problem";
  const next = () => router.replace(`/questions/${scanId}`);

  function place(e: GestureResponderEvent) {
    const { locationX, locationY } = e.nativeEvent;
    setDot({ x: clamp((locationX / box.w) * 100), y: clamp((locationY / box.h) * 100) });
    if (!moved) {
      setMoved(true);
      haptic.select();
    }
  }

  async function save() {
    // Nothing marked: carry on without it.
    if (!moved || !shotId) return next();
    setBusy(true);
    setError(null);
    try {
      await api.markPhoto(scanId, shotId, Math.round(dot.x), Math.round(dot.y));
      next();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that. Try again.");
      setBusy(false);
    }
  }

  return (
    <Screen
      close
      onBack={goHome}
      title={scan ? getTemplate(scan.trade).title : ""}
      scroll={false}
      footer={
        <>
          {error ? (
            <Text variant="caption" tone="danger" style={{ textAlign: "center" }} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button label="Continue" onPress={save} loading={busy} />
        </>
      }
    >
      <Text variant="title" style={{ marginTop: 8 }}>
        Move the dot to {what}.
      </Text>
      <View
        style={styles.photo}
        onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={place}
        onResponderMove={place}
        accessibilityLabel={`Photo. Tap where ${what} is.`}
        accessibilityHint="Drag to move the dot"
      >
        {photo?.uri ? (
          <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" pointerEvents="none" />
        ) : (
          <View style={styles.loading} pointerEvents="none">
            <ActivityIndicator color={colors.white} />
          </View>
        )}
        <View pointerEvents="none" style={[styles.dot, { left: `${dot.x}%`, top: `${dot.y}%` }]}>
          <View style={styles.dotCore} />
        </View>
      </View>
      <Text tone="soft" style={{ marginTop: 16 }}>
        Tap or drag on the photo. It helps the pro see exactly where to look.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { marginTop: 16, height: 352, borderRadius: radius.xl, overflow: "hidden", backgroundColor: colors.camera },
  loading: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  dot: {
    position: "absolute",
    width: 48,
    height: 48,
    marginLeft: -24,
    marginTop: -24,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: colors.white,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  dotCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.white },
});
