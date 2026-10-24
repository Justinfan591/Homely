import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Job, User } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { transition } from "@/lib/jobs";
import { readPhoto, unsentPhotos } from "@/lib/photos";
import type { IntakeStep, JobReport } from "@/shared/types";
import { INTAKE_SYSTEM_PROMPT } from "./prompt";
import { INTAKE_TOOLS, validateToolInput } from "./tools";

type ContentBlock = Anthropic.Beta.BetaContentBlockParam;
type StoredBlock = ContentBlock | { type: "photo_ref"; photoId: number };
type StoredTurn = { role: "user" | "assistant"; content: StoredBlock[] };

const MODEL = "claude-opus-5-5";
const MAX_VALIDATION_RETRIES = 2;

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, "The AI assistant isn't configured yet (missing ANTHROPIC_API_KEY).");
  }
  return (client ??= new Anthropic());
}

export type IntakeInput = {
  text?: string;
  answers?: { question: string; answer: string }[];
  skippedPhotos?: boolean;
};

function loadTurns(jobId: number): StoredTurn[] {
  return db
    .select()
    .from(schema.intakeTurns)
    .where(eq(schema.intakeTurns.jobId, jobId))
    .orderBy(asc(schema.intakeTurns.seq))
    .all()
    .map((t) => ({ role: t.role, content: t.content as StoredBlock[] }));
}

function pendingToolUses(turns: StoredTurn[]) {
  const last = turns.at(-1);
  if (!last || last.role !== "assistant") return [];
  return last.content.filter((b): b is Anthropic.Beta.BetaToolUseBlockParam => b.type === "tool_use");
}

/** Replaces our photo_ref placeholders with a label and the actual image. */
async function hydrate(turns: StoredTurn[]): Promise<Anthropic.Beta.BetaMessageParam[]> {
  const ids = turns.flatMap((t) => t.content.flatMap((b) => (b.type === "photo_ref" ? [b.photoId] : [])));
  const rows = ids.length ? db.select().from(schema.photos).where(inArray(schema.photos.id, ids)).all() : [];
  const data = new Map<number, ContentBlock>();
  for (const p of rows) {
    data.set(p.id, {
      type: "image",
      source: {
        type: "base64",
        media_type: p.mime as "image/jpeg",
        data: (await readPhoto(p)).toString("base64"),
      },
    });
  }
  return turns.map((t) => ({
    role: t.role,
    content: t.content.flatMap((b): ContentBlock[] => {
      if (b.type !== "photo_ref") return [b];
      const image = data.get(b.photoId);
      const label = rows.find((r) => r.id === b.photoId)?.label;
      const marker: ContentBlock = { type: "text", text: `[Photo id=${b.photoId}${label ? ` — ${label}` : ""}]` };
      return image ? [marker, image] : [{ type: "text", text: `[Photo id=${b.photoId} is no longer available]` }];
    }),
  }));
}

function buildUserTurn(job: Job, turns: StoredTurn[], input: IntakeInput, photoIds: number[]): StoredTurn {
  const content: StoredBlock[] = [];
  const pending = pendingToolUses(turns);

  for (const tool of pending) {
    let text: string;
    if (tool.name === "ask_questions" && input.answers?.length) {
      text = input.answers.map((a) => `Q: ${a.question}\nA: ${a.answer || "(no answer)"}`).join("\n\n");
    } else if (tool.name === "request_photos") {
      text = input.skippedPhotos
        ? "The customer couldn't take these photos."
        : photoIds.length
          ? `The customer sent ${photoIds.length} new photo(s), shown below.`
          : "The customer didn't send new photos.";
    } else {
      text = "The customer replied in a message instead.";
    }
    if (input.text) text += `\n\nCustomer's note: ${input.text}`;
    content.push({ type: "tool_result", tool_use_id: tool.id, content: text });
  }

  if (!pending.length) {
    const intro = turns.length === 0;
    const text = input.text || (intro ? job.initialDescription : "") || "";
    content.push({
      type: "text",
      text: intro
        ? `${text ? `Customer's description: ${text}` : "The customer didn't add a description."}\n\nPhotos:`
        : text || "(The customer sent more photos.)",
    });
  }
  for (const id of photoIds) content.push({ type: "photo_ref", photoId: id });
  return { role: "user", content };
}

async function callClaude(job: Job, turns: StoredTurn[]) {
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    cache_control: { type: "ephemeral" },
    system: [
      { type: "text", text: INTAKE_SYSTEM_PROMPT },
      { type: "text", text: `Job location ZIP code: ${job.zip}` },
    ],
    tools: INTAKE_TOOLS,
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
    messages: await hydrate(turns),
  });
  return stream.finalMessage();
}

/**
 * Runs one intake round: sends the customer's latest input (answers, photos or
 * text) to Claude and stores the reply. Returns once Claude has asked for
 * something the customer must provide, or has submitted the report.
 */
export async function runIntakeTurn(job: Job, user: User, input: IntakeInput) {
  if (job.status !== "intake") throw new HttpError(409, "This request has already been submitted.");
  if (inFlight.has(job.id)) throw new HttpError(409, "Still working on your last reply — give it a moment.");
  inFlight.add(job.id);
  try {
    await runIntakeTurnLocked(job, user, input);
  } finally {
    inFlight.delete(job.id);
  }
}

// Jobs with an intake call in progress (single server process).
const inFlight = new Set<number>();

async function runIntakeTurnLocked(job: Job, user: User, input: IntakeInput) {
  const turns = loadTurns(job.id);
  const newPhotos = unsentPhotos(job.id);
  if (!turns.length && !newPhotos.length) throw new HttpError(400, "Add at least one photo to get started.");

  const added: StoredTurn[] = [buildUserTurn(job, turns, input, newPhotos.map((p) => p.id))];
  let report: JobReport | null = null;

  for (let attempt = 0; ; attempt++) {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await callClaude(job, [...turns, ...added]);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err instanceof Anthropic.RateLimitError) throw new HttpError(503, "The assistant is busy. Please try again in a minute.");
      if (err instanceof Anthropic.APIError) {
        console.error("Claude API error", err.status, err.message);
        throw new HttpError(502, "The assistant couldn't respond. Please try again.");
      }
      throw err;
    }

    if (response.stop_reason === "refusal") {
      throw new HttpError(422, "The assistant couldn't help with this request. You can talk to a support agent instead.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new HttpError(502, "The assistant's reply was cut off. Please try again.");
    }

    added.push({ role: "assistant", content: response.content as ContentBlock[] });
    const toolUse = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (!toolUse) break; // Plain text reply; the customer answers in free text.

    const error = validateToolInput(toolUse.name, toolUse.input);
    if (!error) {
      if (toolUse.name === "submit_report") report = (toolUse.input as { report: JobReport }).report;
      break;
    }
    if (attempt >= MAX_VALIDATION_RETRIES) {
      throw new HttpError(502, "The assistant had trouble. Please try again or talk to a support agent.");
    }
    added.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUse.id, is_error: true, content: error }],
    });
  }

  // Save everything only after Claude answered, so a failed call can be retried cleanly.
  db.transaction((tx) => {
    added.forEach((t, i) =>
      tx.insert(schema.intakeTurns).values({ jobId: job.id, seq: turns.length + i, role: t.role, content: t.content }).run(),
    );
    if (newPhotos.length) {
      tx.update(schema.photos)
        .set({ sentToAgent: true })
        .where(inArray(schema.photos.id, newPhotos.map((p) => p.id)))
        .run();
    }
  });

  if (report) {
    transition(job, "report_ready", user, {
      note: "AI report ready",
      set: { report, category: report.category, urgency: report.urgency },
    });
  }
}

/** Turns the stored history into the steps the chat UI shows. */
export function intakeSteps(jobId: number): IntakeStep[] {
  const turns = loadTurns(jobId);
  const results = new Map<string, { isError: boolean }>();
  for (const t of turns) {
    for (const b of t.content) {
      if (b.type === "tool_result") results.set(b.tool_use_id, { isError: !!b.is_error });
    }
  }

  const steps: IntakeStep[] = [];
  for (const t of turns) {
    if (t.role === "user") {
      const texts: string[] = [];
      const photoIds: number[] = [];
      for (const b of t.content) {
        if (b.type === "photo_ref") photoIds.push(b.photoId);
        else if (b.type === "text") texts.push(b.text.replace(/^Customer's description: /, "").replace(/\n\nPhotos:$/, ""));
        else if (b.type === "tool_result" && !b.is_error && typeof b.content === "string") texts.push(b.content);
      }
      if (texts.length || photoIds.length) steps.push({ kind: "customer", text: texts.join("\n\n"), photoIds });
      continue;
    }
    const tool = t.content.find((b): b is Anthropic.Beta.BetaToolUseBlockParam => b.type === "tool_use");
    if (!tool) {
      const text = t.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
      if (text) steps.push({ kind: "note", text });
      continue;
    }
    if (results.get(tool.id)?.isError) continue; // a retried call
    const done = results.has(tool.id);
    const input = tool.input as never;
    if (tool.name === "request_photos") steps.push({ kind: "photos", toolUseId: tool.id, data: input, done });
    else if (tool.name === "ask_questions") steps.push({ kind: "questions", toolUseId: tool.id, data: input, done });
    else if (tool.name === "submit_report") {
      const { message, report } = input as { message: string; report: JobReport };
      steps.push({ kind: "note", text: message });
      steps.push({ kind: "report", toolUseId: tool.id, data: report });
    }
  }
  return steps;
}
