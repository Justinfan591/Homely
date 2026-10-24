import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { useSWRConfig } from "swr";
import { Button } from "@/components/Button";
import { Chip, Stars } from "@/components/Controls";
import { NoteBox } from "@/components/Design";
import { haptic } from "@/components/haptics";
import { goBackOrHome, Screen, Title } from "@/components/Screen";
import { Text } from "@/components/Text";
import { REVIEW_TAGS } from "@/domain/types";
import { useJob } from "@/hooks/data";
import { api } from "@/services";

/** Client · review */
export default function Review() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { data: job } = useJob(jobId);
  const { mutate } = useSWRConfig();
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.rateJob(jobId, { stars, tags, note });
      haptic.success();
      await mutate((key) => Array.isArray(key) && (key[0] === "record" || key[0] === "job"));
      if (router.canGoBack()) router.back();
      else router.replace("/bookings");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your review.");
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        title="Review"
        onBack={goBackOrHome}
        footer={
          <>
            {error ? (
              <Text variant="caption" tone="danger" style={{ textAlign: "center" }} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <Button label="Submit" onPress={submit} disabled={!stars || job?.rating != null} loading={busy} />
          </>
        }
      >
        <View style={{ marginTop: 16 }}>
          <Title title="How was it?" sub={job ? `${job.providerName} · ${job.title}` : " "} />
        </View>
        <View style={{ marginTop: 32 }}>
          <Stars value={job?.rating ?? stars} onChange={job?.rating != null ? undefined : setStars} />
        </View>
        <View style={styles.tags}>
          {REVIEW_TAGS.map((t) => (
            <Chip
              key={t}
              label={t}
              selected={tags.includes(t)}
              onPress={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}
            />
          ))}
        </View>
        <View style={{ marginTop: 24 }}>
          <NoteBox value={note} onChangeText={setNote} placeholder="Add a note (optional)" accessibilityLabel="Review note" />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 32, justifyContent: "center" },
});
