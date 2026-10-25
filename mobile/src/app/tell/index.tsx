import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { haptic } from "@/components/haptics";
import { goHome, Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { intake } from "@/hooks/intake";
import { api } from "@/services";
import { colors } from "@/theme";

type Phase =
  | { kind: "starting" }
  | { kind: "listening" }
  | { kind: "thinking" }
  | { kind: "error"; message: string; canRetry: boolean; settings?: boolean };

const BARS = 24;
/** Each bar's share of the level, so the wave has a shape instead of moving as one block. */
const SHAPE = Array.from({ length: BARS }, (_, i) => 0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + 0.4)));

/** Tell us · listening. Records, the server transcribes it (OpenAI), then the AI suggests what's wrong. */
export default function Listening() {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const state = useAudioRecorderState(recorder, 80);
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const startedAt = useRef(0);
  const [tick, setTick] = useState(0);

  async function start() {
    setPhase({ kind: "starting" });
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setPhase({
          kind: "error",
          message: "Scope needs the microphone to hear you. You can also pick the problem from a list.",
          canRetry: perm.canAskAgain,
          settings: !perm.canAskAgain,
        });
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      haptic.tap();
      setPhase({ kind: "listening" });
    } catch (e) {
      console.warn("Recording failed to start", e);
      setPhase({ kind: "error", message: "We couldn't start the microphone. Try again, or pick the problem from a list.", canRetry: true });
    }
  }

  useEffect(() => {
    void start();
    return () => {
      // Leaving mid-recording: stop and give the audio session back.
      if (recorder.isRecording) recorder.stop().catch(() => {});
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keeps the bars moving a little between metering updates.
  useEffect(() => {
    if (phase.kind !== "listening") return;
    const t = setInterval(() => setTick((n) => n + 1), 90);
    return () => clearInterval(t);
  }, [phase.kind]);

  async function done() {
    if (phase.kind !== "listening") return;
    haptic.tap();
    setPhase({ kind: "thinking" });
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      const uri = recorder.uri;
      if (!uri || Date.now() - startedAt.current < 800) throw new Error("That was a bit short. Tell us a little more about it.");
      intake.source = "voice";
      intake.text = await api.transcribe(uri);
      intake.photoUri = null;
      // Straight to the AI's guess: talking is enough, no photo needed yet.
      intake.result = await api.classify(intake.text, null);
      router.replace("/tell/confirm");
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "We couldn't hear that. Try again.", canRetry: true });
    }
  }

  // metering is dBFS: about -60 (quiet room) to 0 (loud).
  const level = phase.kind === "listening" ? Math.min(1, Math.max(0.08, ((state.metering ?? -60) + 55) / 50)) : 0.08;

  return (
    <Screen
      title={phase.kind === "thinking" ? "Got it" : phase.kind === "error" ? "Tell us" : "Listening"}
      onBack={goHome}
      scroll={false}
    >
      <View style={styles.middle}>
        {phase.kind === "error" ? (
          <View style={{ gap: 12 }}>
            <Text variant="title">Let's try that another way</Text>
            <Text tone="soft">{phase.message}</Text>
          </View>
        ) : (
          <View style={styles.wave} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {SHAPE.map((k, i) => {
              const wobble = phase.kind === "listening" ? 0.75 + 0.25 * Math.sin(tick * 0.9 + i * 1.3) : 1;
              return <View key={i} style={[styles.bar, { transform: [{ scaleY: Math.max(0.1, level * k * wobble) }] }]} />;
            })}
          </View>
        )}
        {phase.kind === "thinking" ? (
          <View style={styles.thinking}>
            <ActivityIndicator color={colors.ink} />
            <Text tone="soft">Working out what's wrong…</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.bottom}>
        {phase.kind === "error" ? (
          <View style={{ alignSelf: "stretch", gap: 8 }}>
            {phase.settings ? (
              <Button label="Open settings" onPress={() => Linking.openSettings()} />
            ) : phase.canRetry ? (
              <Button label="Try again" icon="mic" onPress={() => void start()} />
            ) : null}
            <Button label="Pick the problem instead" variant="ghost" onPress={() => router.replace("/tell/pick")} />
          </View>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done talking"
              disabled={phase.kind !== "listening"}
              onPress={done}
              style={({ pressed }) => [styles.stop, phase.kind !== "listening" && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.94 }] }]}
            >
              <View style={styles.stopSquare} />
            </Pressable>
            <Text variant="label" tone="soft" style={{ fontSize: 15 }}>
              {phase.kind === "starting" ? "Getting ready…" : phase.kind === "thinking" ? " " : "Tap when you're done"}
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  middle: { flex: 1, justifyContent: "center" },
  wave: { flexDirection: "row", alignItems: "center", gap: 5, height: 72, marginTop: 56 },
  bar: { flex: 1, height: 72, borderRadius: 999, backgroundColor: colors.ink },
  thinking: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 32 },
  bottom: { alignItems: "center", gap: 14, minHeight: 124, paddingBottom: 32 },
  stop: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  stopSquare: { width: 24, height: 24, borderRadius: 7, backgroundColor: colors.white },
});
