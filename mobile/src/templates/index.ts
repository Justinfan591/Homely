import type { TradeId, TradeTemplate } from "@/domain/types";
// One source of truth: the same /templates files the server validates and prompts with.
import appliances from "../../../templates/appliances.json";
import electrical from "../../../templates/electrical.json";
import garden from "../../../templates/garden.json";
import handyman from "../../../templates/handyman.json";
import mold from "../../../templates/mold.json";
import painting from "../../../templates/painting.json";
import plumbingSink from "../../../templates/plumbing_sink.json";
import roofing from "../../../templates/roofing.json";

type RawTemplate = {
  trade: string;
  label: string;
  description: string;
  icon?: string;
  area_label?: string;
  required_shots: { id: string; prompt: string; tip?: string; optional?: boolean; skip_label?: string }[];
  questions: { id: string; q: string; options: string[]; optional?: boolean }[];
  notes?: { prompt: string };
  outputs: string[];
  output_labels?: Record<string, string>;
  no_photos?: { title: string; prompt: string };
};

function load(raw: RawTemplate): TradeTemplate {
  return {
    trade: raw.trade,
    title: raw.label,
    blurb: raw.description,
    icon: raw.icon ?? "camera",
    areaLabel: raw.area_label ?? "Affected area",
    requiredShots: raw.required_shots.map((s) => ({
      id: s.id,
      prompt: s.prompt,
      tip: s.tip,
      // Only optional shots can be skipped; the server rejects the rest.
      skipLabel: s.optional ? (s.skip_label ?? "Skip") : undefined,
    })),
    questions: raw.questions.map((q) => ({ id: q.id, q: q.q, options: q.options, optional: q.optional ?? false })),
    notesPrompt: raw.notes?.prompt ?? "Anything else a pro should know?",
    outputs: raw.outputs,
    outputLabels: raw.output_labels ?? {},
    noPhotos: raw.no_photos,
  };
}

// Adding a trade = adding a JSON file to /templates and listing it here.
// Listed in the order of the design's "What's closest?" grid.
export const templates: TradeTemplate[] = [plumbingSink, mold, electrical, handyman, roofing, painting, garden, appliances].map(load);

export function getTemplate(trade: TradeId): TradeTemplate {
  const t = templates.find((x) => x.trade === trade);
  if (!t) throw new Error(`Unknown trade: ${trade}`);
  return t;
}
