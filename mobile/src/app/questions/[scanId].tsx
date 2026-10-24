import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import Animated, { FadeInRight } from "react-native-reanimated";
import { Button } from "@/components/Button";
import { ChoiceRow, Skeleton } from "@/components/Controls";
import { NoteBox } from "@/components/Design";
import { goHome, Screen, Title } from "@/components/Screen";
import { ErrorState } from "@/components/States";
import { Text } from "@/components/Text";
import { useScan } from "@/hooks/data";
import { api } from "@/services";
import { getTemplate } from "@/templates";
import { radius } from "@/theme";

/**
 * Questions · pick / write / notes. One template question per step, a free-text answer when none of
 * the options fit, then an optional note. Also answers a pro's "ask for more" (just their questions).
 */
export default function Questions() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const { data: scan, error, mutate } = useScan(scanId);
  const [step, setStep] = useState(0);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  if (error) {
    return (
      <Screen onBack={goHome}>
        <ErrorState message={error.message} onRetry={() => mutate()} />
      </Screen>
    );
  }
  if (!scan) {
    return (
      <Screen onBack={goHome}>
        <View style={{ gap: 10, marginTop: 32 }}>
          <Skeleton height={40} width="70%" />
          <Skeleton height={68} radius={radius.md} />
          <Skeleton height={68} radius={radius.md} />
          <Skeleton height={68} radius={radius.md} />
        </View>
      </Screen>
    );
  }

  const template = getTemplate(scan.trade);
  const followUp = scan.followUp;
  const questions = template.questions.filter((q) => !followUp || followUp.questionIds?.includes(q.id));
  const onNotes = step >= questions.length;
  const q = questions[step];
  const answer = q ? answers[q.id] : undefined;
  const custom = !!q && !!answer && !q.options.includes(answer);

  function back() {
    if (writing) return setWriting(false);
    if (step > 0) return setStep(step - 1);
    goHome();
  }

  function next() {
    setWriting(false);
    setStep(step + 1);
  }

  async function send(withNote: boolean) {
    setSending(true);
    setSendError(null);
    try {
      await api.submitAnswers(scanId, answers, withNote ? note.trim() : "");
      router.replace(`/book/${scanId}`);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Couldn't save your answers.");
      setSending(false);
    }
  }

  // ---- Notes ----
  if (onNotes) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Screen
          onBack={back}
          footer={
            <>
              {sendError ? (
                <Text variant="caption" tone="danger" style={{ textAlign: "center" }} accessibilityRole="alert">
                  {sendError}
                </Text>
              ) : null}
              {!note.trim() ? <Button label="Skip" variant="ghost" onPress={() => send(false)} disabled={sending} /> : null}
              <Button label={followUp ? `Send to ${followUp.provider}` : "Find a pro"} onPress={() => send(true)} loading={sending} />
            </>
          }
        >
          <View style={{ marginTop: 16 }}>
            <Title title={followUp ? `Anything to add for ${followUp.provider}?` : "Anything else we should know?"} sub="Optional." size="title" />
          </View>
          <View style={{ marginTop: 28 }}>
            <NoteBox value={note} onChangeText={setNote} placeholder="Add a note for the pro" accessibilityLabel="Note for the pro" />
          </View>
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  // ---- Something else? Write it ----
  if (writing && q) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Screen
          onBack={back}
          footer={
            <Button
              label="Continue"
              disabled={!draft.trim()}
              onPress={() => {
                setAnswers((a) => ({ ...a, [q.id]: draft.trim() }));
                next();
              }}
            />
          }
        >
          <View style={{ marginTop: 16 }}>
            <Title title="Tell us in your words." sub={`${q.q} A few words is plenty.`} size="title" />
          </View>
          <View style={{ marginTop: 28 }}>
            <NoteBox value={draft} onChangeText={setDraft} placeholder="e.g. Behind the dishwasher" maxLength={200} autoFocus accessibilityLabel={q.q} />
          </View>
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  // ---- Pick ----
  return (
    <Screen
      onBack={back}
      trailing={
        questions.length > 1 ? (
          <Text variant="label" tone="soft">
            {step + 1}/{questions.length}
          </Text>
        ) : null
      }
      footer={<Button label="Continue" onPress={next} disabled={!answer && !q.optional} />}
    >
      <Animated.View key={q.id} entering={FadeInRight.duration(260)}>
        {followUp && step === 0 && followUp.message ? (
          <Text variant="label" tone="soft" style={{ marginTop: 8 }}>
            {followUp.provider}: {followUp.message}
          </Text>
        ) : null}
        <View style={{ marginTop: 16 }}>
          <Title title={q.q} sub={q.optional ? "Optional." : null} size="title" />
        </View>
        <View style={{ gap: 10, marginTop: 28 }} accessibilityRole="radiogroup">
          {q.options.map((o) => (
            <ChoiceRow key={o} label={o} selected={answer === o} onPress={() => setAnswers((a) => ({ ...a, [q.id]: o }))} />
          ))}
          {custom ? <ChoiceRow label={answer!} selected onPress={() => (setDraft(answer!), setWriting(true))} /> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setDraft(custom ? answer! : "");
            setWriting(true);
          }}
          hitSlop={8}
          style={({ pressed }) => [{ alignSelf: "center", marginTop: 24 }, pressed && { opacity: 0.5 }]}
        >
          <Text tone="soft">
            Something else? <Text variant="bodyStrong">Write it</Text>
          </Text>
        </Pressable>
      </Animated.View>
    </Screen>
  );
}
