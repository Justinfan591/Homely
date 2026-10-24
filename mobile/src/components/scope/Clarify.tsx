import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ScanResponse } from "@shared/scope";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";
import { Button, Card, Chip, ChipRow, ErrorText, Input, LinkText, Muted, Title } from "../ui";
import { Kicker } from "./Parts";

/** 2-3 tap-to-answer questions, plus an optional note. Then the spec is generated. */
export function Clarify({ data, onDone }: { data: ScanResponse; onDone: (next: ScanResponse) => void }) {
  const { template, scan, job } = data;
  const focus = scan.focus;
  const asked = focus ? template.questions.filter((q) => focus.questionIds.includes(q.id)) : template.questions;
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({ ...scan.answers }));
  const [noteOpen, setNoteOpen] = useState(!!focus?.message);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const missing = asked.filter((q) => !q.optional && !answers[q.id]);
  const proName = job?.provider?.name ?? "your pro";

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const picked = Object.fromEntries(asked.filter((q) => answers[q.id]).map((q) => [q.id, answers[q.id]]));
      onDone(await api<ScanResponse>(`/api/scans/${scan.id}/finish`, { body: { answers: picked, notes: note.trim() || null } }));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 6 }}>
        <Kicker>{template.label}</Kicker>
        <Title>{focus ? `${proName} needs a bit more` : asked.length ? "A few quick questions" : "Almost done"}</Title>
        {focus?.message ? <Text style={st.request}>“{focus.message}”</Text> : null}
      </View>

      {asked.map((q) => (
        <Card key={q.id}>
          <Text style={st.q}>
            {q.q}
            {q.optional ? <Text style={st.optional}>  optional</Text> : null}
          </Text>
          <ChipRow>
            {q.options.map((o) => (
              <Chip key={o} label={o} selected={answers[q.id] === o} onPress={() => setAnswers((a) => ({ ...a, [q.id]: a[q.id] === o ? "" : o }))} />
            ))}
          </ChipRow>
        </Card>
      ))}

      {template.notes.enabled &&
        (noteOpen ? (
          <Card>
            <Text style={st.q}>{focus?.message ? `Reply to ${proName} (optional)` : template.notes.prompt}</Text>
            <Input value={note} onChangeText={setNote} multiline placeholder="e.g. It gets worse in winter" maxLength={1000} />
          </Card>
        ) : (
          <LinkText title="+ Add a note (optional)" onPress={() => setNoteOpen(true)} style={{ fontSize: 16 }} />
        ))}

      <ErrorText>{error}</ErrorText>
      <Button title={busy ? "Building your estimate…" : focus ? `Send to ${proName}` : "Get my estimate"} large loading={busy} disabled={missing.length > 0} onPress={submit} />
      {busy ? <Muted style={{ textAlign: "center" }}>This takes about 10 seconds.</Muted> : null}
    </View>
  );
}

const st = StyleSheet.create({
  q: { fontFamily: font.semibold, fontSize: 18, color: colors.ink },
  optional: { fontFamily: font.regular, fontSize: 14, color: colors.ink40 },
  request: { fontFamily: font.regular, fontSize: 17, color: colors.ink75, lineHeight: 24 },
});
