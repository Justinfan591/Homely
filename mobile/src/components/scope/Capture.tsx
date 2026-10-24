import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ScanResponse, ShotResult } from "@shared/scope";
import { api } from "@/lib/api";
import { pickPhotos, prepareCapture, uploadShot, type PickedPhoto } from "@/lib/photos";
import { colors, font, radius } from "@/lib/theme";
import { Button } from "../ui";
import { Dots } from "./Parts";

type Feedback = { text: string; tone: "bad" | "good" };

/** Full-screen guided capture: one shot at a time, each checked by the vision model. */
export function Capture({ data, refresh }: { data: ScanResponse; refresh: () => Promise<unknown> }) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"capture" | "check" | "skip" | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [remaining, setRemaining] = useState<string[] | null>(null);

  const { template, scan } = data;
  const left = remaining ?? data.remainingShots;
  const shot = template.required_shots.find((s) => s.id === left[0]);
  // The dots cover the whole template, or just the requested shots when a pro asked for more.
  const list = scan.focus ? template.required_shots.filter((s) => scan.focus!.shotIds.includes(s.id)) : template.required_shots;
  const states = list.map((s) => (s.id === shot?.id ? "current" : left.includes(s.id) ? "todo" : "done")) as ("done" | "current" | "todo")[];

  async function finishStep(result: ShotResult) {
    setRemaining(result.remainingShots);
    if (result.ok) {
      setFeedback({ text: result.message || "Got it.", tone: "good" });
      setTimeout(() => setFeedback((f) => (f?.tone === "good" ? null : f)), 1200);
      if (result.status !== "capturing") await refresh();
    } else {
      setFeedback({ text: result.message || "Let's try that again.", tone: "bad" });
    }
  }

  async function send(photo: PickedPhoto) {
    if (!shot) return;
    setPreview(photo.uri);
    setBusy("check");
    try {
      await finishStep(await uploadShot<ShotResult>(scan.id, shot.id, photo));
    } catch (err) {
      setFeedback({ text: (err as Error).message, tone: "bad" });
    } finally {
      setPreview(null);
      setBusy(null);
    }
  }

  async function shoot() {
    if (!camera.current || busy) return;
    setBusy("capture");
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.8 });
      if (!pic) throw new Error("The camera didn't return a photo.");
      await send(await prepareCapture(pic));
    } catch (err) {
      setFeedback({ text: (err as Error).message, tone: "bad" });
      setBusy(null);
    }
  }

  async function fromLibrary() {
    if (busy) return;
    const [photo] = await pickPhotos("library", 1);
    if (photo) await send(photo);
  }

  async function skip() {
    if (!shot || busy) return;
    setBusy("skip");
    try {
      await finishStep(await api<ShotResult>(`/api/scans/${scan.id}/skip`, { body: { shotId: shot.id } }));
      setFeedback(null);
    } catch (err) {
      setFeedback({ text: (err as Error).message, tone: "bad" });
    } finally {
      setBusy(null);
    }
  }

  const close = () => (router.canGoBack() ? router.back() : router.replace("/customer" as never));

  if (!permission) return <View style={st.root} />;
  if (!permission.granted) {
    return (
      <View style={[st.root, st.center, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <Text style={st.permTitle}>Scope needs your camera</Text>
        <Text style={st.permBody}>You'll take {list.length} quick photos. We guide you through each one.</Text>
        <Button
          title={permission.canAskAgain ? "Allow camera" : "Open Settings"}
          large
          style={{ alignSelf: "stretch" }}
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
        />
        <Text onPress={fromLibrary} style={st.permLink}>
          Choose a photo instead
        </Text>
        <Text onPress={close} style={st.permLink}>
          Not now
        </Text>
      </View>
    );
  }

  // After a check, its message replaces the shot prompt until the next photo.
  const guidance = feedback;
  const index = list.findIndex((s) => s.id === shot?.id);

  return (
    <View style={st.root}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
      {preview && <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} contentFit="cover" />}

      {/* Top: close, progress, guidance */}
      <View style={[st.top, { paddingTop: insets.top + 8 }]}>
        <View style={st.topRow}>
          <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close" style={st.close}>
            <Text style={st.closeText}>✕</Text>
          </Pressable>
          <Dots states={states} />
          <Text style={st.counter}>{index >= 0 ? `${index + 1}/${list.length}` : ""}</Text>
        </View>
        {scan.focus?.message && index === 0 && !guidance ? <Text style={st.request}>Your pro asked: {scan.focus.message}</Text> : null}
        <View style={[st.guide, guidance?.tone === "bad" && st.guideBad, guidance?.tone === "good" && st.guideGood]}>
          <Text style={st.guideText}>{guidance ? guidance.text : shot?.prompt ?? "All set"}</Text>
        </View>
      </View>

      {busy === "check" && (
        <View style={st.checking}>
          <ActivityIndicator color={colors.white} />
          <Text style={st.checkingText}>Checking photo…</Text>
        </View>
      )}

      {/* Bottom: tip, library, shutter, skip */}
      <View style={[st.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={st.tip}>Keep faces and documents out of the shot</Text>
        <View style={st.controls}>
          <Pressable onPress={fromLibrary} disabled={!!busy} style={st.side} hitSlop={8}>
            <Text style={st.sideText}>Library</Text>
          </Pressable>
          <Pressable onPress={shoot} disabled={!!busy || !shot} style={({ pressed }) => [st.shutter, (pressed || !!busy) && { opacity: 0.6 }]} accessibilityLabel="Take photo">
            <View style={st.shutterInner} />
          </Pressable>
          <Pressable onPress={skip} disabled={!!busy || !shot?.optional} style={st.side} hitSlop={8}>
            {shot?.optional ? <Text style={st.sideText}>{shot.skip_label ?? "Skip"}</Text> : null}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center", padding: 28, gap: 16, backgroundColor: colors.white },
  permTitle: { fontFamily: font.bold, fontSize: 26, color: colors.ink, textAlign: "center" },
  permBody: { fontFamily: font.regular, fontSize: 17, color: colors.ink60, textAlign: "center", lineHeight: 24 },
  permLink: { fontFamily: font.semibold, fontSize: 16, color: colors.brand600, paddingVertical: 6 },
  top: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: 16, gap: 12, alignItems: "center" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", alignSelf: "stretch" },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  closeText: { color: colors.white, fontSize: 18 },
  counter: { width: 40, textAlign: "right", color: colors.white, fontFamily: font.semibold, fontSize: 14 },
  request: { color: colors.white, fontFamily: font.medium, fontSize: 14, backgroundColor: "rgba(47,107,255,0.85)", borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, overflow: "hidden", textAlign: "center" },
  guide: { backgroundColor: "rgba(0,0,0,0.6)", borderRadius: radius.lg, paddingHorizontal: 18, paddingVertical: 12, maxWidth: "100%" },
  guideBad: { backgroundColor: "rgba(185,28,28,0.9)" },
  guideGood: { backgroundColor: "rgba(22,163,74,0.9)" },
  guideText: { color: colors.white, fontFamily: font.semibold, fontSize: 20, textAlign: "center", lineHeight: 26 },
  checking: { position: "absolute", alignSelf: "center", top: "45%", flexDirection: "row", gap: 10, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: radius.full, paddingHorizontal: 18, paddingVertical: 10 },
  checkingText: { color: colors.white, fontFamily: font.semibold, fontSize: 16 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, gap: 14 },
  tip: { color: "rgba(255,255,255,0.85)", fontFamily: font.regular, fontSize: 13, textAlign: "center" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  side: { width: 104, minHeight: 44, justifyContent: "center", alignItems: "center" },
  sideText: { color: colors.white, fontFamily: font.semibold, fontSize: 14, textAlign: "center" },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 5, borderColor: colors.white, alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.white },
});
