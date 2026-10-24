import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Button } from "@/components/Button";
import { Chip, Skeleton } from "@/components/Controls";
import { Icon } from "@/components/Icon";
import { goHome, Screen } from "@/components/Screen";
import { ErrorState } from "@/components/States";
import { Text } from "@/components/Text";
import { useScan } from "@/hooks/data";
import { api } from "@/services";
import { getTemplate } from "@/templates";
import { colors, radius } from "@/theme";

export default function Clarify() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const { data: scan, error, mutate } = useScan(scanId);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const template = scan ? getTemplate(scan.trade) : undefined;
  const followUp = scan?.followUp;
  const questions = template?.questions.filter((q) => !followUp || followUp.questionIds?.includes(q.id)) ?? [];
  const complete = !!template && questions.every((q) => q.optional || answers[q.id]);

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.submitAnswers(scanId, answers, note.trim());
      router.replace(`/spec/${scanId}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't save your answers.");
      setSubmitting(false);
    }
  }

  return (
    <Screen
      onBack={() => goHome()}
      footer={
        <>
          {submitError ? (
            <Text variant="caption" tone="danger" style={{ textAlign: "center" }} accessibilityRole="alert">
              {submitError}
            </Text>
          ) : null}
          <Button label="See my estimate" onPress={submit} disabled={!complete} loading={submitting} />
        </>
      }
    >
      <Text variant="title">{followUp ? `${followUp.provider} has a question` : "A few quick questions"}</Text>
      <Text tone="soft" style={{ marginTop: 8 }}>
        {followUp?.message || "Tap to answer. This helps us size the job."}
      </Text>

      {error ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : !template ? (
        <View style={{ gap: 24, marginTop: 32 }}>
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={90} />
        </View>
      ) : (
        <View style={{ gap: 32, marginTop: 32 }}>
          {questions.map((q) => (
            <View key={q.id} style={{ gap: 14 }}>
              <Text variant="heading">
                {q.q}
                {q.optional ? <Text tone="soft"> (optional)</Text> : null}
              </Text>
              <View style={styles.chips} accessibilityRole="radiogroup">
                {q.options.map((o) => (
                  <Chip
                    key={o}
                    label={o}
                    selected={answers[q.id] === o}
                    onPress={() => setAnswers((a) => ({ ...a, [q.id]: o }))}
                  />
                ))}
              </View>
            </View>
          ))}

          {noteOpen ? (
            <View style={{ gap: 14 }}>
              <Text variant="heading">{template.notesPrompt}</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Optional"
                placeholderTextColor={colors.inkFaint}
                multiline
                autoFocus
                maxLength={500}
                style={styles.input}
                accessibilityLabel="Additional note"
              />
            </View>
          ) : (
            <Pressable onPress={() => setNoteOpen(true)} style={styles.addNote} accessibilityRole="button">
              <Icon name="plus" size={18} color={colors.accent} />
              <Text variant="label" tone="accent">
                Add a note
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  addNote: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4 },
  input: {
    minHeight: 110,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    padding: 16,
    fontFamily: "Inter_400Regular",
    fontSize: 17,
    color: colors.ink,
    textAlignVertical: "top",
  },
});
