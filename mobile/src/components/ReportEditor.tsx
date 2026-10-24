import { useState } from "react";
import { View } from "react-native";
import { TRADES, TRADE_LABELS, type JobReport } from "@shared/types";
import { Button, Chip, ChipRow, Field, Input } from "./ui";

const LIST_FIELDS = [
  ["observed_issues", "What we see"],
  ["likely_causes", "Likely causes"],
  ["safety_hazards", "Safety hazards"],
  ["scope_of_work", "Work needed"],
  ["materials_likely", "Parts & materials"],
] as const;

export const BLANK_REPORT: JobReport = {
  title: "",
  category: "handyman",
  summary: "",
  urgency: "soon",
  observed_issues: [],
  likely_causes: [],
  safety_hazards: [],
  scope_of_work: [],
  materials_likely: [],
  est_hours: { min: 1, max: 2 },
  est_cost_usd: { min: 100, max: 300 },
  access_notes: "",
  customer_answers: [],
  photo_ids_referenced: [],
  confidence: "medium",
};

const URGENCIES: { value: JobReport["urgency"]; label: string }[] = [
  { value: "emergency", label: "Emergency" },
  { value: "soon", label: "Soon" },
  { value: "flexible", label: "Flexible" },
];

function NumberInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  return (
    <Input
      value={text}
      keyboardType="decimal-pad"
      onChangeText={(t) => {
        setText(t);
        onChange(Math.max(0, Number(t.replace(",", ".")) || 0));
      }}
    />
  );
}

export function ReportEditor({ report, onSave, onCancel }: { report: JobReport; onSave: (r: JobReport) => Promise<void>; onCancel: () => void }) {
  const [r, setR] = useState(report);
  const [lists, setLists] = useState(() => Object.fromEntries(LIST_FIELDS.map(([k]) => [k, report[k].join("\n")])) as Record<string, string>);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const next = { ...r };
    for (const [k] of LIST_FIELDS) next[k] = lists[k].split("\n").map((x) => x.trim()).filter(Boolean);
    await onSave(next).finally(() => setSaving(false));
  }

  const half = { flex: 1 };
  return (
    <View style={{ gap: 14 }}>
      <Field label="Title">
        <Input value={r.title} onChangeText={(v) => setR({ ...r, title: v })} />
      </Field>
      <Field label="Trade">
        <ChipRow>
          {TRADES.map((t) => (
            <Chip key={t} label={TRADE_LABELS[t]} selected={r.category === t} onPress={() => setR({ ...r, category: t })} />
          ))}
        </ChipRow>
      </Field>
      <Field label="Urgency">
        <ChipRow>
          {URGENCIES.map((u) => (
            <Chip key={u.value} label={u.label} selected={r.urgency === u.value} onPress={() => setR({ ...r, urgency: u.value })} />
          ))}
        </ChipRow>
      </Field>
      <Field label="Summary">
        <Input multiline value={r.summary} onChangeText={(v) => setR({ ...r, summary: v })} />
      </Field>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={half}>
          <Field label="Cost min $">
            <NumberInput value={r.est_cost_usd.min} onChange={(n) => setR((x) => ({ ...x, est_cost_usd: { ...x.est_cost_usd, min: n } }))} />
          </Field>
        </View>
        <View style={half}>
          <Field label="Cost max $">
            <NumberInput value={r.est_cost_usd.max} onChange={(n) => setR((x) => ({ ...x, est_cost_usd: { ...x.est_cost_usd, max: n } }))} />
          </Field>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={half}>
          <Field label="Hours min">
            <NumberInput value={r.est_hours.min} onChange={(n) => setR((x) => ({ ...x, est_hours: { ...x.est_hours, min: n } }))} />
          </Field>
        </View>
        <View style={half}>
          <Field label="Hours max">
            <NumberInput value={r.est_hours.max} onChange={(n) => setR((x) => ({ ...x, est_hours: { ...x.est_hours, max: n } }))} />
          </Field>
        </View>
      </View>
      {LIST_FIELDS.map(([k, label]) => (
        <Field key={k} label={label} hint="One per line">
          <Input multiline value={lists[k]} onChangeText={(v) => setLists((l) => ({ ...l, [k]: v }))} />
        </Field>
      ))}
      <Field label="Access notes">
        <Input multiline value={r.access_notes} onChangeText={(v) => setR({ ...r, access_notes: v })} />
      </Field>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button title="Save report" onPress={save} loading={saving} />
        <Button title="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </View>
  );
}
