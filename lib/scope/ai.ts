import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { HttpError } from "@/lib/auth";
import type { Shot, Template } from "@/shared/scope";
import type { ImageType } from "./photos";

// Named in SOON26.md. All responses are JSON-only (structured outputs) and zod-validated.
const MODEL = "claude-sonnet-5-5";

/**
 * SCOPE_FAKE_AI=1 swaps both Claude calls for instant, free, predictable answers,
 * so UI work and `npm run test:e2e` don't need an API key. Rules:
 * - a photo under 2 KB (e.g. a solid black frame) is rejected as too dark; anything else passes;
 * - the spec is severity 3, 2 m², confidence 0.85, or 0.45 (→ human review) when the note contains "handoff".
 */
export const fakeAi = () => process.env.SCOPE_FAKE_AI === "1";

/** "fake", "claude" or "missing_key": shown by GET /api/health. */
export const aiMode = () => (fakeAi() ? "fake" : process.env.ANTHROPIC_API_KEY ? "claude" : "missing_key");

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, "The AI assistant isn't configured yet (missing ANTHROPIC_API_KEY).");
  }
  return (client ??= new Anthropic());
}

type Image = { data: Buffer; type: ImageType };
const imageBlock = (img: Image): Anthropic.Beta.BetaImageBlockParam => ({
  type: "image",
  source: { type: "base64", media_type: img.type, data: img.data.toString("base64") },
});

async function parse<T extends z.ZodType>(schema: T, params: { system: string; content: Anthropic.Beta.BetaContentBlockParam[]; effort: "low" | "medium" }) {
  let response;
  try {
    response = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: params.effort, format: betaZodOutputFormat(schema) },
      system: params.system,
      messages: [{ role: "user", content: params.content }],
    });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof Anthropic.RateLimitError) throw new HttpError(503, "The assistant is busy. Please try again in a minute.");
    if (err instanceof Anthropic.APIError) {
      console.error("Claude API error", err.status, err.message);
      throw new HttpError(502, "The assistant couldn't respond. Please try again.");
    }
    throw err;
  }
  if (response.stop_reason === "refusal") throw new HttpError(422, "The assistant couldn't process this photo. Try another angle.");
  if (response.stop_reason === "max_tokens") throw new HttpError(502, "The assistant's reply was cut off. Please try again.");
  const out = schema.safeParse(response.parsed_output);
  if (!out.success) {
    console.error("Claude returned invalid JSON", out.error.message);
    throw new HttpError(502, "The assistant had trouble. Please try again.");
  }
  return out.data as z.infer<T>;
}

// ---------- 1. Per-shot check ----------

const shotCheckSchema = z.object({
  ok: z.boolean(),
  issue: z.enum(["none", "blurry", "too_dark", "wrong_subject", "too_far", "too_close", "person_or_document"]),
  message: z.string(),
  observation: z.string(),
});
export type ShotCheck = z.infer<typeof shotCheckSchema>;

const SHOT_SYSTEM = `You check one photo in a guided home-problem scan. The homeowner is pointing their phone camera at a problem, one shot at a time.

Decide if this photo is usable for the requested shot:
- ok=false, issue "blurry" if the subject is too blurry to see detail.
- ok=false, issue "too_dark" if it's too dark to see.
- ok=false, issue "wrong_subject" if it clearly doesn't show what the shot asks for.
- ok=false, issue "too_far" / "too_close" when framing makes it unusable for this shot.
- ok=false, issue "person_or_document" if a person's face or a readable document, ID, mail or screen is prominent. We don't store those.
- Otherwise ok=true, issue "none". Be practical: a slightly imperfect but usable photo is ok. Don't reject for minor issues.

message: one short, friendly line for the homeowner (max 12 words). If ok, a brief confirmation like "Got it." If not, say exactly how to retake ("Hold steady and tap again", "Turn on a light", "Step back so the whole room is in view").
observation: one or two factual sentences about what is visible that matters for the job (for example size and colour of staining, materials, nearby fixtures). Describe; never diagnose. Empty if ok=false.`;

export async function checkShot(template: Template, shot: Shot, image: Image): Promise<ShotCheck> {
  if (fakeAi()) {
    return image.data.length < 2048
      ? { ok: false, issue: "too_dark", message: "Too dark to see. Turn on a light and retake.", observation: "" }
      : { ok: true, issue: "none", message: "Got it.", observation: `Test photo for "${shot.prompt}".` };
  }
  const result = await parse(shotCheckSchema, {
    system: SHOT_SYSTEM,
    effort: "low",
    content: [
      imageBlock(image),
      {
        type: "text",
        text: `Trade: ${template.label}\nRequested shot: "${shot.prompt}"${shot.hint ? `\nWhat it should show: ${shot.hint}` : ""}\n\nWording rules for observations:\n${template.policy.rules.map((r) => `- ${r}`).join("\n")}`,
      },
    ],
  });
  if (result.ok) result.issue = "none";
  return result;
}

// ---------- 2. JobSpec ----------

const specSchemaFor = (template: Template) => {
  const keys = template.outputs.filter((k) => k !== "severity" && k !== "affected_area_m2");
  return z.object({
    title: z.string(),
    summary: z.string(),
    severity: z.number(),
    affected_area_m2: z.number(),
    confidence: z.number(),
    fields: z.object(Object.fromEntries(keys.map((k) => [k, z.string()]))),
  });
};

export type SpecInput = {
  template: Template;
  photos: { shotId: string; observation: string | null; image: Image }[];
  skippedShots: string[];
  answers: Record<string, string>;
  notes: string | null;
  proRequest: string | null;
};

export type GeneratedSpec = {
  title: string;
  summary: string;
  severity: number;
  areaM2: number;
  confidence: number;
  fields: Record<string, string>;
};

function specSystem(t: Template) {
  const labels = t.outputs.map((k) => `- ${k}${t.output_labels[k] ? ` (${t.output_labels[k]})` : ""}`).join("\n");
  return `You turn a homeowner's guided photo scan into a standard job spec for a ${t.label.toLowerCase()} job. A pro reads it before quoting and visiting. Prices are calculated separately from your severity and area: never mention prices or costs.

Rules:
- Never diagnose. The standard finding wording is: "${t.policy.finding_wording}" Use it (or very close) in the summary.
${t.policy.rules.map((r) => `- ${r}`).join("\n")}
- Only state what the photos, answers and notes support. Don't invent details or premises; if something wasn't shown, say it wasn't shown.
- title: short and neutral, e.g. "Staining on bathroom ceiling".
- summary: 2-3 plain sentences for the pro.
- severity: integer 1-5 (1 = small cosmetic, 3 = moderate spread or recurring, 5 = large area, structural or active water).
- affected_area_m2: your best estimate of the visibly affected surface in square metres, using the wide shots for scale. 0 if none.
- confidence: 0 to 1, how sure you are the spec is right. Lower it for unclear photos, skipped shots, contradictions or a scene that doesn't match the trade. Below 0.6 sends the job to a human reviewer, so be honest.
- fields: fill every key with a short phrase. Use "Not visible" or "Unknown" rather than guessing.

Output keys:
${labels}`;
}

export async function generateSpec(input: SpecInput): Promise<GeneratedSpec> {
  const t = input.template;
  if (fakeAi()) {
    const keys = t.outputs.filter((k) => k !== "severity" && k !== "affected_area_m2");
    return {
      title: `${t.label} (test scan)`,
      summary: `${t.policy.finding_wording} Generated by the fake AI from ${input.photos.length} photo(s).`,
      severity: 3,
      areaM2: 2,
      confidence: /handoff/i.test(input.notes ?? "") ? 0.45 : 0.85,
      fields: Object.fromEntries(keys.map((k) => [k, "Not visible (test scan)"])),
    };
  }
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const p of input.photos) {
    const shot = t.required_shots.find((s) => s.id === p.shotId);
    content.push({ type: "text", text: `Shot "${shot?.prompt ?? p.shotId}"${p.observation ? ` — check noted: ${p.observation}` : ""}` });
    content.push(imageBlock(p.image));
  }
  const skipped = input.skippedShots.map((id) => {
    const s = t.required_shots.find((x) => x.id === id);
    return `- "${s?.prompt ?? id}": ${s?.skip_label ?? "skipped"}`;
  });
  const answers = t.questions
    .filter((q) => input.answers[q.id])
    .map((q) => `- ${q.q} ${input.answers[q.id]}`);
  content.push({
    type: "text",
    text: [
      skipped.length ? `Skipped shots (homeowner's reason):\n${skipped.join("\n")}` : "No shots were skipped.",
      answers.length ? `Answers:\n${answers.join("\n")}` : "No answers.",
      input.notes ? `Homeowner's note: ${input.notes}` : "",
      input.proRequest ? `The pro previously asked: ${input.proRequest}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  const out = await parse(specSchemaFor(t), { system: specSystem(t), content, effort: "medium" });
  const fields = Object.fromEntries(Object.entries(out.fields).map(([k, v]) => [k, String(v).trim()]));
  return {
    title: out.title.trim().slice(0, 120),
    summary: out.summary.trim(),
    severity: Math.min(5, Math.max(1, Math.round(out.severity))),
    areaM2: Math.max(0, Math.round(out.affected_area_m2 * 10) / 10),
    confidence: Math.min(1, Math.max(0, Math.round(out.confidence * 100) / 100)),
    fields,
  };
}
