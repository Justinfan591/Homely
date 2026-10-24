import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { Provider } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import {
  DESCRIPTION_MAX,
  PROFILE_MAX_QUESTIONS,
  PROFILE_MIN_QUESTIONS,
  pricingFromRateCard,
  profileFactsSchema,
  profileStatus,
  rateCardFromPricing,
  type ProfileFacts,
  type ProfilePricing,
  type ProfileQuestion,
  type ProfileView,
  type ProfileTurn,
  type ProProfile,
} from "@/shared/scope";
import { UNTRUSTED_NOTE, fakeAi, parse } from "./ai";
import { getTemplate } from "./templates";
import { normalizeWebsite, readWebsite } from "./website";

/**
 * The profile agent: interviews a pro on /pro, one tap-to-answer question at a time,
 * then writes structured facts and a summary the matching agent (fit.ts) reads.
 * Prices are a separate, fixed step at the end: the pro types them and code builds the rate card.
 */

const { providers } = schema;

export function profileView(p: Provider): ProfileView {
  return { status: profileStatus(p), profile: p.profile, description: p.description, website: p.website, rateCard: p.rateCard, pricing: pricingFromRateCard(p.rateCard) };
}

function save(p: Provider, set: Partial<Pick<Provider, "profile" | "description" | "rateCard" | "website" | "websiteText">>): Provider {
  return db.update(providers).set(set).where(eq(providers.id, p.id)).returning().get();
}

const tradeLabels = (p: Provider) =>
  p.trades.map((t) => {
    try {
      return getTemplate(t).label;
    } catch {
      return t;
    }
  });

// ---------- The agent ----------

const stepSchema = z.object({
  done: z.boolean(),
  question: z.object({ q: z.string(), options: z.array(z.string()), multi: z.boolean() }).nullable(),
  facts: profileFactsSchema.nullable(),
  description: z.string().nullable(),
});

const STEP_SYSTEM = `You interview a home-service pro to build their matching profile. A matching agent later reads the profile next to each homeowner job spec, and ranks pros on four things: specialties, job sizes, availability, and what they don't take. A pricing agent also reads it for what the pro includes in their work. So learn what kinds of jobs this pro is the right choice for, and which they are not.

How to interview:
- Ask ONE short question at a time (max 15 words), with 2-6 short tap-able answer options (max 6 words each). The pro can also type a note, so don't add an "Other" option.
- Set multi=true when several options can apply at once (e.g. job types, days), false for a single choice (e.g. typical job size).
- Tailor questions to the pro's trades and to their earlier answers: dig into what they said, don't repeat what you already know (including from their existing summary).
- Cover what matters for routing: the job types and problem areas they specialize in, typical job size, materials or locations (basements, attics, kitchens...), certifications or equipment, emergency or same-day work, evenings/weekends, and what they don't take on.
- If <pro_website> is given, it's a fact sheet taken from the pro's own website: don't ask what it already answers clearly; instead confirm or dig into it (e.g. which of the listed services they want most). Put things in facts and description only if the pro confirmed them or the site states them plainly.
- Never ask about prices, rates or fees: pricing is a separate step after the interview.
- A skipped question (no answer) means the pro didn't want to answer: move on.
- ${UNTRUSTED_NOTE}

When you have enough to route jobs well (or you are told to finish), set done=true, question=null and fill:
- facts.specialties: 2-8 short phrases for the job types and problems they are best at, worded the way a job spec would describe the problem (e.g. "Bathroom ceiling mold", "Under-sink leaks", "Basement and crawl-space mold"), not marketing language.
- facts.jobSizes: one short phrase, e.g. "Small to medium jobs, under 10 m²".
- facts.availability: one short phrase, e.g. "Weekdays and evenings; same-day leaks".
- facts.notes: one short sentence on anything else that matters for routing or pricing (certifications, what their price includes). If they named jobs they don't take, start with "Doesn't take: ...". Empty if nothing.
- description: 2-4 plain third-person sentences summarizing the pro for the matching agent. Only what the pro said; no prices.
While not done: question is set and facts and description are null.`;

type Step = { done: false; question: ProfileQuestion } | { done: true; facts: ProfileFacts; description: string };

function turnLine(t: ProfileTurn, i: number) {
  const a = t.answer.length || t.note ? [t.answer.join(", "), t.note ? `note: "${t.note}"` : ""].filter(Boolean).join("; ") : "(skipped)";
  return `${i + 1}. Q: ${t.q}\n   A: ${a}`;
}

const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/** One interview step. Exported for scripts/eval-agents.ts. */
export async function nextStep(p: Provider, turns: ProfileTurn[]): Promise<Step> {
  const asked = turns.length;
  if (fakeAi()) return fakeStep(p, turns);

  const mustFinish = asked >= PROFILE_MAX_QUESTIONS;
  const rule = mustFinish
    ? "You have asked the maximum number of questions. Finish now: done=true."
    : asked < PROFILE_MIN_QUESTIONS
      ? `Ask at least ${PROFILE_MIN_QUESTIONS - asked} more question(s) before finishing.`
      : `You may ask up to ${PROFILE_MAX_QUESTIONS - asked} more question(s), or finish now if you have enough.`;
  const text = [
    `<pro>`,
    `Name: ${p.name}`,
    `Trades: ${tradeLabels(p).join(", ")}`,
    `Service radius: ${p.radiusKm} km`,
    `<pro_profile>`,
    `Existing summary (written by the pro earlier): ${p.description?.trim() || "(none)"}`,
    `</pro_profile>`,
    `</pro>`,
    ``,
    ...(p.websiteText ? [`<pro_website url="${p.website}">`, p.websiteText, `</pro_website>`, ``] : []),
    `<interview>`,
    asked ? turns.map(turnLine).join("\n") : "(no questions asked yet)",
    `</interview>`,
    ``,
    rule,
  ].join("\n");

  const out = await parse(stepSchema, { system: STEP_SYSTEM, effort: "low", content: [{ type: "text", text }] });
  const finish = (out.done && asked >= PROFILE_MIN_QUESTIONS) || mustFinish || !out.question;
  if (finish) {
    const facts = out.facts ?? factsFromTurns(turns);
    return {
      done: true,
      facts: {
        specialties: facts.specialties.map((s) => clean(s, 80)).filter(Boolean).slice(0, 8),
        jobSizes: clean(facts.jobSizes, 160),
        availability: clean(facts.availability, 160),
        notes: clean(facts.notes, 300),
      },
      description: clean(out.description ?? describe(p, facts), DESCRIPTION_MAX),
    };
  }
  const options = [...new Set(out.question!.options.map((o) => clean(o, 60)).filter(Boolean))].slice(0, 6);
  if (options.length < 2) throw new HttpError(502, "The assistant had trouble. Please try again.");
  return { done: false, question: { id: `q${asked + 1}`, q: clean(out.question!.q, 200), options, multi: out.question!.multi } };
}

// ---------- Fake AI (SCOPE_FAKE_AI=1): four fixed questions ----------

function fakeQuestions(p: Provider): Omit<ProfileQuestion, "id">[] {
  const trades = tradeLabels(p).join(" / ").toLowerCase();
  return [
    { q: `Which ${trades} jobs do you take on?`, options: ["Small repairs", "Large or whole-room jobs", "Inspections and assessments", "Emergency call-outs"], multi: true },
    { q: "What size of job suits you best?", options: ["Small (under 2 m²)", "Medium (2-10 m²)", "Large (10 m² and up)", "Any size"], multi: false },
    { q: "When can you usually visit?", options: ["Weekdays", "Evenings", "Weekends", "Same-day emergencies"], multi: true },
    { q: "Anything you don't take on?", options: ["I take it all", "Severe or structural damage", "Commercial properties", "Jobs needing permits"], multi: true },
  ];
}

function fakeStep(p: Provider, turns: ProfileTurn[]): Step {
  const qs = fakeQuestions(p);
  if (turns.length < qs.length) return { done: false, question: { id: `q${turns.length + 1}`, ...qs[turns.length] } };
  const facts = factsFromTurns(turns);
  return { done: true, facts, description: describe(p, facts) };
}

/** Plain facts straight from the answers: the fake AI's output, and a fallback if the agent leaves them out. */
function factsFromTurns(turns: ProfileTurn[]): ProfileFacts {
  const a = (i: number) => [...(turns[i]?.answer ?? []), turns[i]?.note ?? ""].filter(Boolean).join(", ");
  return { specialties: turns[0]?.answer.length ? turns[0].answer : ["General work"], jobSizes: a(1) || "Not stated", availability: a(2) || "Not stated", notes: a(3) ? `Doesn't take: ${a(3)}` : "" };
}

function describe(p: Provider, f: ProfileFacts) {
  return [`${p.name} handles ${tradeLabels(p).join(" and ").toLowerCase()} jobs: ${f.specialties.join(", ").toLowerCase()}.`, `Job sizes: ${f.jobSizes}.`, `Availability: ${f.availability}.`, f.notes].filter(Boolean).join(" ");
}

// ---------- Interview steps (each returns the saved provider) ----------

/** Asks the agent for the next question, or moves to the pricing step when it's done. */
async function advance(p: Provider, profile: ProProfile): Promise<Provider> {
  // Save first, so an AI failure never loses an answer: the pro just taps "Try again".
  p = save(p, { profile: { ...profile, pending: null } });
  const step = await nextStep(p, profile.turns);
  return save(p, {
    profile: step.done
      ? { ...profile, stage: "pricing", pending: null, facts: step.facts, draftDescription: step.description }
      : { ...profile, pending: step.question },
  });
}

/** Start (or redo) the interview. The current description and rate card stay until the pro finishes. */
export function startInterview(p: Provider) {
  return advance(p, { stage: "interview", turns: [], pending: null, facts: null, draftDescription: null, completedAt: null });
}

function interviewing(p: Provider) {
  if (p.profile?.stage !== "interview") throw new HttpError(409, "Start the profile questions first.");
  return p.profile;
}

/** After an AI failure: ask again for the next question. */
export function retry(p: Provider) {
  const profile = interviewing(p);
  if (profile.pending) return Promise.resolve(p);
  return advance(p, profile);
}

export function answer(p: Provider, input: { answer: string[]; note: string | null }) {
  const profile = interviewing(p);
  const q = profile.pending;
  if (!q) throw new HttpError(409, "No question is open. Try again.");
  const picked = [...new Set(input.answer)];
  const note = input.note?.trim().slice(0, 500) || null;
  const bad = picked.find((a) => !q.options.includes(a));
  if (bad) throw new HttpError(400, `"${bad}" isn't an option for: ${q.q}`);
  if (!q.multi && picked.length > 1) throw new HttpError(400, "Pick one answer.");
  if (!picked.length && !note) throw new HttpError(400, "Pick an answer, add a note, or skip the question.");
  return advance(p, { ...profile, turns: [...profile.turns, { ...q, answer: picked, note }] });
}

export function skip(p: Provider) {
  const profile = interviewing(p);
  const q = profile.pending;
  if (!q) throw new HttpError(409, "No question is open. Try again.");
  return advance(p, { ...profile, turns: [...profile.turns, { ...q, answer: [], note: null }] });
}

/** The last step (and later edits): the pro's prices become the rate card. Finishing also saves the summary. */
export function savePricing(p: Provider, pricing: ProfilePricing) {
  const profile = p.profile;
  if (profile?.stage !== "pricing" && profile?.stage !== "complete") throw new HttpError(409, "Answer the profile questions first.");
  if (profile.stage === "complete") return save(p, { rateCard: rateCardFromPricing(pricing) });
  return save(p, {
    rateCard: rateCardFromPricing(pricing),
    description: profile.draftDescription ?? p.description,
    profile: { ...profile, stage: "complete", completedAt: new Date().toISOString() },
  });
}

/**
 * Saves the pro's website and crawls the site into a fact sheet for the profile agent. Empty clears it.
 * Returns whether the page could be read; an unreadable site is still saved.
 */
export async function saveWebsite(p: Provider, input: string): Promise<{ provider: Provider; read: boolean }> {
  if (!input.trim()) return { provider: save(p, { website: null, websiteText: null }), read: false };
  const url = normalizeWebsite(input);
  if (!url) throw new HttpError(400, "Enter a website address, like moldbusters.com.");
  const text = await readWebsite(url);
  return { provider: save(p, { website: url, websiteText: text }), read: !!text };
}

/** The pro's own edit of the summary the matching agent reads. Used for new requests (existing rankings stay). */
export function saveDescription(p: Provider, text: string) {
  return save(p, { description: text.trim().slice(0, DESCRIPTION_MAX) || null });
}
