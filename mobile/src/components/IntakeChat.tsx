import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { JobResponse } from "@shared/api-types";
import type { IntakeStep, PhotoRequest, QuestionSet } from "@shared/types";
import { api } from "@/lib/api";
import { uploadPhotos, type PickedPhoto } from "@/lib/photos";
import { colors, radius } from "@/lib/theme";
import { ApiImage, PhotoPicker } from "./Photos";
import { Button, Chip, ChipRow, ErrorText, Input } from "./ui";

type Payload = { text?: string; answers?: { question: string; answer: string }[]; skippedPhotos?: boolean };

function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <View style={st.assistantRow}>
      <View style={st.avatar}>
        <Text style={st.avatarText}>M</Text>
      </View>
      <View style={st.assistantBubble}>{children}</View>
    </View>
  );
}

function CustomerBubble({ text, photoIds }: { text: string; photoIds: number[] }) {
  return (
    <View style={{ alignItems: "flex-end", gap: 6 }}>
      {photoIds.length > 0 && (
        <View style={st.customerPhotos}>
          {photoIds.map((id) => (
            <ApiImage key={id} path={`/api/photos/${id}`} style={st.customerPhoto} />
          ))}
        </View>
      )}
      {text ? <Text style={st.customerBubble}>{text}</Text> : null}
    </View>
  );
}

function Typing({ label }: { label: string }) {
  return (
    <AssistantBubble>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <ActivityIndicator size="small" color={colors.ink50} />
        <Text style={{ color: colors.ink60, fontSize: 14 }}>{label}</Text>
      </View>
    </AssistantBubble>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <View style={st.panel}>{children}</View>;
}

function PhotoRequestForm({ data, onSubmit, busy }: { data: PhotoRequest; onSubmit: (photos: PickedPhoto[], p: Payload) => void; busy: boolean }) {
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [note, setNote] = useState("");
  const n = photos.length;
  return (
    <Panel>
      <PhotoPicker photos={photos} onChange={setPhotos} max={Math.max(1, data.shots.length + 2)} />
      <Input value={note} onChangeText={setNote} placeholder="Add a note (optional)" />
      <View style={st.actions}>
        <Button
          title={`Send ${n > 0 ? `${n} photo${n > 1 ? "s" : ""}` : "photos"}`}
          loading={busy}
          disabled={!n}
          onPress={() => onSubmit(photos, { text: note || undefined })}
        />
        <Button title="I can't take these" variant="ghost" disabled={busy} onPress={() => onSubmit([], { skippedPhotos: true, text: note || undefined })} />
      </View>
    </Panel>
  );
}

function QuestionForm({ data, onSubmit, busy }: { data: QuestionSet; onSubmit: (p: Payload) => void; busy: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const set = (id: string, v: string) => setAnswers((a) => ({ ...a, [id]: v }));
  const answered = data.questions.filter((q) => answers[q.id]?.trim()).length;

  return (
    <Panel>
      {data.questions.map((q) => {
        const options = q.type === "yes_no" ? ["Yes", "No", "Not sure"] : q.options;
        return (
          <View key={q.id} style={{ gap: 8 }}>
            <Text style={st.question}>{q.text}</Text>
            {q.type === "text" || !options.length ? (
              <Input value={answers[q.id] ?? ""} onChangeText={(v) => set(q.id, v)} multiline />
            ) : (
              <ChipRow>
                {options.map((o) => (
                  <Chip key={o} label={o} selected={answers[q.id] === o} onPress={() => set(q.id, o)} />
                ))}
              </ChipRow>
            )}
          </View>
        );
      })}
      <Button
        title="Send answers"
        loading={busy}
        disabled={answered === 0}
        onPress={() => onSubmit({ answers: data.questions.map((q) => ({ question: q.text, answer: answers[q.id]?.trim() || "Not sure" })) })}
      />
    </Panel>
  );
}

function FreeReply({ onSubmit, busy }: { onSubmit: (photos: PickedPhoto[], p: Payload) => void; busy: boolean }) {
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [showPhotos, setShowPhotos] = useState(false);
  return (
    <Panel>
      <Input value={text} onChangeText={setText} multiline placeholder="Type your reply…" />
      {showPhotos && <PhotoPicker photos={photos} onChange={setPhotos} max={4} />}
      <View style={st.actions}>
        <Button title="Send" loading={busy} disabled={!text.trim() && !photos.length} onPress={() => onSubmit(photos, { text: text.trim() || undefined })} />
        {!showPhotos && <Button title="Add photos" variant="ghost" onPress={() => setShowPhotos(true)} />}
      </View>
    </Panel>
  );
}

function StepView({ step }: { step: IntakeStep }) {
  if (step.kind === "customer") return <CustomerBubble text={step.text} photoIds={step.photoIds} />;
  if (step.kind === "note")
    return (
      <AssistantBubble>
        <Text style={st.text}>{step.text}</Text>
      </AssistantBubble>
    );
  if (step.kind === "photos") {
    return (
      <AssistantBubble>
        <Text style={st.text}>{step.data.message}</Text>
        <View style={{ gap: 8, marginTop: 10 }}>
          {step.data.shots.map((s, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 8 }}>
              <View style={st.num}>
                <Text style={st.numText}>{i + 1}</Text>
              </View>
              <Text style={[st.small, { flex: 1 }]}>
                <Text style={{ fontWeight: "600" }}>{s.label}:</Text> {s.instructions}
              </Text>
            </View>
          ))}
        </View>
      </AssistantBubble>
    );
  }
  if (step.kind === "questions") {
    return (
      <AssistantBubble>
        <Text style={st.text}>{step.data.message}</Text>
        {step.done && (
          <View style={{ marginTop: 6, gap: 2 }}>
            {step.data.questions.map((q) => (
              <Text key={q.id} style={[st.small, { color: colors.ink60 }]}>
                • {q.text}
              </Text>
            ))}
          </View>
        )}
      </AssistantBubble>
    );
  }
  return null; // reports are shown by the job screen
}

/** Read-only view of the AI conversation, for support agents. */
export function IntakeTranscript({ steps }: { steps: IntakeStep[] }) {
  if (!steps.length) return <Text style={{ color: colors.ink50, fontSize: 14 }}>No conversation yet.</Text>;
  return (
    <View style={{ gap: 14 }}>
      {steps.map((s, i) => (
        <StepView key={i} step={s} />
      ))}
    </View>
  );
}

export function IntakeChat({ job, refresh, onChange }: { job: JobResponse; refresh: () => Promise<unknown>; onChange?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const lastPayload = useRef<Payload>({});
  const started = useRef(false);
  const steps = job.intake;

  async function send(photos: PickedPhoto[], payload: Payload) {
    setBusy(true);
    setError("");
    lastPayload.current = payload;
    try {
      await uploadPhotos(job.job.id, photos);
    } catch (err) {
      // Keep the form open so the customer can fix the photos and resend.
      setUploadError((err as Error).message);
      setBusy(false);
      return;
    }
    setUploadError("");
    try {
      await api(`/api/jobs/${job.job.id}/intake`, { body: payload });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // The first round starts automatically once the photos from the new-request form are uploaded.
  useEffect(() => {
    if (!started.current && steps.length === 0) {
      started.current = true;
      send([], {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onChange?.();
  }, [steps.length, busy, onChange]);

  const last = steps.at(-1);
  const waitingOn = !busy && !error ? last : undefined;

  return (
    <View style={{ gap: 14 }}>
      {steps.map((s, i) => (
        <StepView key={i} step={s} />
      ))}
      {busy && <Typing label={steps.length ? "Thinking…" : "Looking at your photos…"} />}

      {waitingOn?.kind === "photos" && !waitingOn.done && <PhotoRequestForm data={waitingOn.data} busy={busy} onSubmit={send} />}
      {waitingOn?.kind === "questions" && !waitingOn.done && <QuestionForm data={waitingOn.data} busy={busy} onSubmit={(p) => send([], p)} />}
      {(waitingOn?.kind === "note" || waitingOn?.kind === "customer") && <FreeReply busy={busy} onSubmit={send} />}

      {uploadError ? (
        <View style={st.indent}>
          <ErrorText>{uploadError}</ErrorText>
        </View>
      ) : null}
      {error ? (
        <View style={[st.indent, { gap: 8 }]}>
          <ErrorText>{error}</ErrorText>
          <Button title="Try again" variant="secondary" onPress={() => send([], lastPayload.current)} />
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  assistantRow: { flexDirection: "row", gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand600, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.white, fontSize: 12, fontWeight: "700" },
  assistantBubble: {
    flexShrink: 1,
    maxWidth: "88%",
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderTopLeftRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: colors.border,
  },
  customerPhotos: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 6, maxWidth: "88%" },
  customerPhoto: { width: 80, height: 80, borderRadius: radius.md, overflow: "hidden" },
  customerBubble: {
    maxWidth: "88%",
    backgroundColor: colors.brand600,
    color: colors.white,
    borderRadius: radius.lg,
    borderTopRightRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    overflow: "hidden",
  },
  panel: { marginLeft: 42, gap: 12, backgroundColor: "rgba(236,253,247,0.8)", borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: "rgba(16,185,138,0.18)" },
  indent: { marginLeft: 42 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  question: { fontSize: 14, fontWeight: "600", color: colors.ink },
  text: { fontSize: 15, color: colors.ink, lineHeight: 21 },
  small: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  num: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.brand100, alignItems: "center", justifyContent: "center", marginTop: 1 },
  numText: { fontSize: 11, fontWeight: "700", color: colors.brand700 },
});
