import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { CameraPanel, pickFromLibrary, Shutter, useCamera } from "@/components/CameraPanel";
import { haptic } from "@/components/haptics";
import { Icon } from "@/components/Icon";
import { goHome, Screen } from "@/components/Screen";
import { ErrorState } from "@/components/States";
import { Text } from "@/components/Text";
import { markShot } from "@/domain/scan";
import { useScan } from "@/hooks/data";
import { api } from "@/services";
import { getTemplate } from "@/templates";
import { colors, shadow } from "@/theme";

type Phase = { kind: "live" } | { kind: "checking"; uri: string } | { kind: "accepted"; uri: string };

/** Capture · guided photos. One prompt at a time; each photo is checked before moving on. */
export default function ScanScreen() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const { data: scan, error, mutate } = useScan(scanId);
  const camera = useCamera();

  const [phase, setPhase] = useState<Phase>({ kind: "live" });
  const [notice, setNotice] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [taken, setTaken] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const shake = useSharedValue(0);

  const template = scan ? getTemplate(scan.trade) : undefined;
  // Which shots this session covers: the whole template, or just what a provider asked for.
  const sessionShots = useRef<string[] | null>(null);
  if (scan && !sessionShots.current) sessionShots.current = scan.pendingShotIds;
  const shots = useMemo(
    () => template?.requiredShots.filter((s) => sessionShots.current?.includes(s.id)) ?? [],
    [template, scan], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const shot = shots[index];

  // Resume where a draft left off.
  useEffect(() => {
    if (scan && !ready) {
      const firstOpen = (sessionShots.current ?? []).findIndex((id) => scan.pendingShotIds.includes(id));
      setIndex(Math.max(0, firstOpen));
      setReady(true);
    }
  }, [scan, ready]);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  async function finish() {
    const latest = await mutate().catch(() => scan);
    const s = latest ?? scan;
    if (!s) return;
    if (s.followUp) {
      // A pro's follow-up may ask questions again; otherwise the first answers are kept.
      const askAgain = !!s.followUp.questionIds?.length;
      const hasAnswers = Object.keys(s.answers).length > 0;
      router.replace(hasAnswers && !askAgain ? `/book/${scanId}` : `/questions/${scanId}`);
      return;
    }
    router.replace(markShot(s) ? `/mark/${scanId}` : `/questions/${scanId}`);
  }

  // Nothing to photograph (e.g. the pro only asked a question): go straight on.
  useEffect(() => {
    if (scan && template && ready && shots.length === 0) void finish();
  }, [scan, template, ready, shots.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function advance() {
    if (index + 1 >= shots.length) void finish();
    else {
      setIndex(index + 1);
      setPhase({ kind: "live" });
      setNotice(null);
    }
  }

  async function submit(uri: string) {
    if (!shot) return;
    setPhase({ kind: "checking", uri });
    setNotice(null);
    try {
      const verdict = await api.submitPhoto(scanId, shot.id, uri);
      if (verdict.ok) {
        haptic.success();
        setTaken((t) => [...t, uri]);
        setPhase({ kind: "accepted", uri });
        setTimeout(advance, 650);
      } else {
        haptic.warning();
        shake.value = withSequence(
          withTiming(-10, { duration: 50 }),
          withTiming(10, { duration: 80 }),
          withTiming(-6, { duration: 70 }),
          withTiming(0, { duration: 50 }),
        );
        setNotice(verdict.message);
        setPhase({ kind: "live" });
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Upload failed. Try again.");
      setPhase({ kind: "live" });
    }
  }

  async function capture() {
    if (busy || phase.kind !== "live") return;
    setBusy(true);
    try {
      const uri = await camera.snap();
      if (uri) await submit(uri);
    } catch {
      setNotice("Couldn't take the photo. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function library() {
    if (phase.kind !== "live") return;
    const uri = await pickFromLibrary();
    if (uri) await submit(uri);
  }

  async function skip() {
    if (!shot || phase.kind !== "live") return;
    haptic.select();
    try {
      await api.skipShot(scanId, shot.id);
      advance();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't skip that one.");
    }
  }

  if (error) {
    return (
      <Screen close onBack={goHome}>
        <ErrorState message={error.message} onRetry={() => mutate()} />
      </Screen>
    );
  }
  if (!scan || !template || !shot) {
    return (
      <Screen close onBack={goHome} scroll={false}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.ink} />
        </View>
      </Screen>
    );
  }

  const live = phase.kind === "live";
  const status =
    phase.kind === "checking" ? { text: "Checking photo…" } : phase.kind === "accepted" ? { text: "Got it", done: true } : null;

  return (
    <Screen
      close
      onBack={goHome}
      title={template.title}
      scroll={false}
      trailing={
        <Text variant="label" tone="soft">
          {index + 1}/{shots.length}
        </Text>
      }
    >
      <CameraPanel camera={camera} previewUri={live ? null : phase.uri} status={status} onLibrary={live ? library : undefined} />

      <Animated.View style={[shakeStyle, { marginTop: 28, minHeight: 96 }]}>
        <Animated.View key={shot.id} entering={FadeInDown.duration(260)}>
          <Text variant="title" accessibilityLiveRegion="polite">
            {scan.followUp && index === 0 ? `${scan.followUp.provider}: ${shot.prompt}` : shot.prompt}
          </Text>
          <Text tone={notice ? "danger" : "soft"} style={{ marginTop: 8 }} accessibilityLiveRegion="polite">
            {notice ?? (index === 0 && !taken.length ? `${shot.tip ?? ""} Keep faces and documents out of the frame.`.trim() : shot.tip)}
          </Text>
        </Animated.View>
      </Animated.View>

      <View style={styles.controls}>
        <View style={styles.side}>
          {shot.skipLabel && live ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Skip: ${shot.skipLabel}`} onPress={skip} hitSlop={8}>
              <Text variant="label" tone="soft" style={{ fontSize: 15 }}>
                Skip
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Shutter onPress={capture} disabled={!camera.granted || !live || busy} />
        <View style={[styles.side, styles.thumbs]}>
          {taken.slice(-2).map((uri) => (
            <View key={uri} style={[styles.thumb, shadow]}>
              <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <View style={styles.thumbCheck}>
                <Icon name="check" size={13} color={colors.white} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 88, marginTop: 20, marginBottom: 32 },
  side: { width: 96 },
  thumbs: { flexDirection: "row", justifyContent: "flex-end", gap: 6 },
  thumb: { width: 28, height: 38, borderRadius: 9, backgroundColor: colors.card, overflow: "hidden" },
  thumbCheck: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(22,21,19,0.45)", alignItems: "center", justifyContent: "center" },
});
