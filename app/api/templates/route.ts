import { route } from "@/lib/api";
import { templates } from "@/lib/scope/templates";
import type { TemplateSummary } from "@/shared/scope";

/** Trades the homeowner can scan. One per /templates/*.json file. */
export const GET = route(async () => ({
  templates: [...templates().values()].map(
    (t): TemplateSummary => ({ trade: t.trade, label: t.label, description: t.description, shots: t.required_shots.length, questions: t.questions.length }),
  ),
}));
