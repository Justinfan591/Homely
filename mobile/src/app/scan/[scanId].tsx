import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { ProgressDots } from "@/components/Controls";
import { Glass } from "@/components/Glass";
import { haptic } from "@/components/haptics";
import { Icon } from "@/components/Icon";
import { CircleButton, goBackOrHome } from "@/components/Screen";
import { ErrorState } from "@/components/States";
import { Text } from "@/components/Text";
import { useScan } from "@/hooks/data";
import { api } from "@/services";
import { getTemplate } from "@/templates";
import { colors, gutter, radius } from "@/theme";

type Phase = { kind: "live" } | { kind: "checking"; uri: string } | { kind: "accepted"; uri: string };

export default function ScanScreen() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const { data: scan, error, mutate } = useScan(scanId);
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);

  const [phase, setPhase] = useState<Phase>({ kind: "live" });
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(null);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const shake = useSharedValue(0);
  const flash = useSharedValue(0);

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
      setDone(new Set(scan.photos.map((p) => p.shotId)));
      setSkipped(new Set(scan.skipped));
      const firstOpen = (sessionShots.current ?? []).findIndex((id) => scan.pendingShotIds.includes(id));
      setIndex(Math.max(0, firstOpen));
      setReady(true);
    }
  }, [scan, ready]);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  function finish() {
    // A pro's follow-up may ask questions again; otherwise answers from the first pass are kept.
    const askAgain = !!scan?.followUp?.questionIds?.length;
    const hasAnswers = scan && Object.keys(scan.answers).length > 0;
    router.replace(hasAnswers && !askAgain ? `/spec/${scanId}` : `/clarify/${scanId}`);
  }

  // Nothing to photograph (e.g. the pro only asked a question): go straight on.
  useEffect(() => {
    if (scan && template && ready && shots.length === 0) finish();
  }, [scan, template, ready, shots.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function advance() {
    if (index + 1 >= shots.length) finish();
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
        setDone((d) => new Set(d).add(shot.id));
        setPhase({ kind: "accepted", uri });
        mutate();
        setTimeout(advance, 650);
      } else {
        haptic.warning();
        shake.value = withSequence(
          withTiming(-10, { duration: 50 }),
          withTiming(10, { duration: 80 }),
          withTiming(-6, { duration: 70 }),
          withTiming(0, { duration: 50 }),
        );
        setNotice({ text: verdict.message, bad: true });
        setPhase({ kind: "live" });
      }
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : "Upload failed. Try again.", bad: true });
      setPhase({ kind: "live" });
    }
  }

  async function capture() {
    if (busy || phase.kind !== "live" || !camera.current) return;
    setBusy(true);
    haptic.tap();
    flash.value = withSequence(withTiming(0.7, { duration: 60 }), withTiming(0, { duration: 220 }));
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.6, skipProcessing: true });
      await submit(photo.uri);
    } catch {
      setNotice({ text: "Couldn't take the photo. Try again.", bad: true });
    } finally {
      setBusy(false);
    }
  }

  async function pickFromLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (!res.canceled && res.assets[0]) await submit(res.assets[0].uri);
  }

  async function skip() {
    if (!shot || phase.kind !== "live") return;
    haptic.select();
    try {
      await api.skipShot(scanId, shot.id);
      setSkipped((s) => new Set(s).add(shot.id));
      mutate();
      advance();
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : "Couldn't skip that one.", bad: true });
    }
  }

  if (error) {
    return (
      <View style={styles.light}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: gutter }}>
          <CircleButton icon="x" label="Close" onPress={goBackOrHome} />
        </View>
        <ErrorState message={error.message} onRetry={() => mutate()} />
      </View>
    );
  }
  if (!scan || !template || !shot) {
    return (
      <View style={[styles.light, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  const stepState = shots.map((s) => (done.has(s.id) ? "done" : skipped.has(s.id) ? "skipped" : "todo")) as (
    | "done"
    | "skipped"
    | "todo"
  )[];
  const checking = phase.kind === "checking";
  const accepted = phase.kind === "accepted";
  const previewUri = phase.kind === "live" ? null : phase.uri;
  const granted = permission?.granted;
  const guidance = notice?.text ?? shot.prompt;

  return (
    <View style={styles.dark}>
      {granted ? (
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => {}} />
      ) : permission && !permission.granted ? (
        <PermissionPrompt
          canAsk={permission.canAskAgain}
          onAllow={requestPermission}
          onLibrary={pickFromLibrary}
        />
      ) : null}

      {previewUri ? (
        <Animated.View entering={FadeIn.duration(120)} style={StyleSheet.absoluteFill}>
          <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.35)" }]} />
        </Animated.View>
      ) : null}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "white" }, flashStyle]} />

      {/* Top: close, progress, guidance */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topRow}>
          <CircleButton icon="x" label="Close" dark onPress={goBackOrHome} />
          <Glass style={styles.dotsWrap}>
            <ProgressDots steps={stepState.map((state) => ({ state }))} current={index} dark />
          </Glass>
          <View style={{ width: 40 }} />
        </View>
        <Animated.View style={[shakeStyle, { marginTop: 18 }]}>
          <Animated.View key={guidance} entering={FadeInDown.duration(260)}>
            <Glass style={[styles.guidance, notice?.bad && { backgroundColor: "rgba(199,58,58,0.85)" }]}>
              <Text variant="bodyStrong" tone="white" style={{ textAlign: "center" }} accessibilityLiveRegion="polite">
                {guidance}
              </Text>
            </Glass>
          </Animated.View>
          <Text variant="caption" style={styles.tip}>
            {notice?.bad ? "Check the lighting and try again." : shot.tip}
          </Text>
        </Animated.View>
      </View>

      {/* Status over the photo while the vision check runs */}
      {checking || accepted ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.status} pointerEvents="none">
          <Glass style={styles.statusPill}>
            {checking ? <ActivityIndicator color="white" /> : <Icon name="check" size={20} color="white" />}
            <Text variant="bodyStrong" tone="white">
              {checking ? "Checking photo…" : "Got it"}
            </Text>
          </Glass>
        </Animated.View>
      ) : null}

      {/* Bottom: skip, shutter, library */}
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        {index === 0 && phase.kind === "live" ? (
          <Text variant="caption" style={styles.privacy}>
            Keep faces and documents out of the frame.
          </Text>
        ) : null}
        <View style={styles.controls}>
          <View style={styles.side}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose from library"
              onPress={pickFromLibrary}
              disabled={phase.kind !== "live"}
              style={{ opacity: phase.kind === "live" ? 1 : 0.3 }}
            >
              <Glass style={styles.smallBtn}>
                <Icon name="image" size={20} color="white" />
              </Glass>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            onPress={capture}
            disabled={!granted || phase.kind !== "live"}
            style={({ pressed }) => [styles.shutter, { opacity: !granted || phase.kind !== "live" ? 0.4 : 1 }, pressed && { transform: [{ scale: 0.94 }] }]}
          >
            <View style={styles.shutterInner} />
          </Pressable>
          <View style={styles.side} />
        </View>
        <View style={{ height: 52, justifyContent: "center", alignItems: "center" }}>
          {shot.skipLabel && phase.kind === "live" ? (
            <Pressable onPress={skip} accessibilityRole="button" hitSlop={8}>
              <Glass style={styles.skip}>
                <Text variant="label" tone="white">
                  {shot.skipLabel}
                </Text>
              </Glass>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function PermissionPrompt({
  canAsk,
  onAllow,
  onLibrary,
}: {
  canAsk: boolean;
  onAllow: () => void;
  onLibrary: () => void;
}) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.permission]}>
      <View style={styles.permissionIcon}>
        <Icon name="camera" size={26} color="white" />
      </View>
      <Text variant="title" tone="white" style={{ textAlign: "center" }}>
        Camera access
      </Text>
      <Text tone="white" style={{ textAlign: "center", opacity: 0.7 }}>
        Scope needs your camera to photograph the problem. Photos are only used to scope your job.
      </Text>
      <View style={{ gap: 10, alignSelf: "stretch", marginTop: 12 }}>
        <Button
          label={canAsk ? "Allow camera" : "Open settings"}
          onPress={() => (canAsk ? onAllow() : Linking.openSettings())}
          style={{ backgroundColor: colors.white }}
        />
        <Button label="Choose from library" variant="ghost" onDark onPress={onLibrary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  light: { flex: 1, backgroundColor: colors.bg },
  dark: { flex: 1, backgroundColor: "#111" },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: gutter },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dotsWrap: { paddingHorizontal: 14, height: 34, borderRadius: radius.pill, justifyContent: "center", overflow: "hidden" },
  guidance: {
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 26,
    overflow: "hidden",
    maxWidth: "100%",
  },
  tip: { color: "rgba(255,255,255,0.85)", textAlign: "center", marginTop: 10, paddingHorizontal: 16 },
  status: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: gutter, gap: 14 },
  privacy: { color: "rgba(255,255,255,0.8)", textAlign: "center" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  side: { width: 56, alignItems: "flex-start" },
  smallBtn: { width: 48, height: 48, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  shutter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    borderColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: "white" },
  skip: { paddingHorizontal: 18, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  permission: { alignItems: "center", justifyContent: "center", padding: gutter, gap: 12, backgroundColor: "#111" },
  permissionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
});
