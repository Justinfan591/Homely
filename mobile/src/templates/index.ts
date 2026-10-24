import type { TradeId, TradeTemplate } from "@/domain/types";
import mold from "./mold.json";
import plumbingSink from "./plumbing_sink.json";

type RawTemplate = {
  trade: string;
  title: string;
  blurb: string;
  icon: string;
  areaLabel: string;
  required_shots: { id: string; prompt: string; tip?: string; skip_label?: string }[];
  questions: { id: string; q: string; options: string[] }[];
  notes_prompt: string;
  outputs: string[];
};

function load(raw: RawTemplate): TradeTemplate {
  return {
    trade: raw.trade,
    title: raw.title,
    blurb: raw.blurb,
    icon: raw.icon,
    areaLabel: raw.areaLabel,
    requiredShots: raw.required_shots.map((s) => ({
      id: s.id,
      prompt: s.prompt,
      tip: s.tip,
      skipLabel: s.skip_label,
    })),
    questions: raw.questions,
    notesPrompt: raw.notes_prompt,
    outputs: raw.outputs,
  };
}

// Adding a trade = adding a JSON file and listing it here.
export const templates: TradeTemplate[] = [mold, plumbingSink].map(load);

export function getTemplate(trade: TradeId): TradeTemplate {
  const t = templates.find((x) => x.trade === trade);
  if (!t) throw new Error(`Unknown trade: ${trade}`);
  return t;
}
