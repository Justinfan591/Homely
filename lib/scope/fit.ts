import "server-only";
import { z } from "zod";
import type { Provider } from "@/db/schema";
import { FIT_MIN, profileStatus, type ProviderFit, type Template } from "@/shared/scope";
import { SHORT_LINE_RULES, UNTRUSTED_NOTE, cleanLine, fakeAi, parseComplete, policyLines, type GeneratedSpec } from "./ai";

/**
 * The matching agent: after a spec is generated, Claude ranks the in-range pros
 * by how well their description fits this problem, then by distance.
 * Hard rules (trade, service radius, declines) stay in matching.ts; this only orders.
 */

const fitSchema = z.object({
  ranking: z.array(z.object({ provider_id: z.number(), score: z.number(), reason: z.string() })),
});

function fitSystem(t: Template) {
  return `You route a homeowner's job to the right home-service pros. You get a job spec (written by a spec agent from the homeowner's photos and answers) and the pros who already cover this trade and area. Code has already applied the hard rules (trade, service radius, declines); you only order them.

Who uses your output: the homeowner sees the pros in your order, each with your reason. Pros scored below ${FIT_MIN} are hidden while a better fit exists.

How to rank:
- Specialization first: how well the pro's profile matches what this job needs (problem type, location in the home, materials, size, severity, urgency).
- A complete profile (specialties, job sizes, availability, what they don't take) is the strongest signal: trust a clear match there over a vague summary, and score a pro below ${FIT_MIN} if their profile says they don't take this kind or size of job.
- A "summary only" pro has just a short self-description: judge fit from it.
- Then distance: closer is better, and matters more for severe or active problems.
- Rating breaks ties.
- A pro with no description is an unknown fit: score them around 50-60 and rank them by distance and rating, below clear specialists.

score: 0-100 fit for this job.
- 80-100: a clear specialist for exactly this kind and size of job.
- 50-79: can do this job, but it isn't their focus, or their profile is vague.
- ${FIT_MIN}-49: a weak fit (for example the job is bigger or smaller than they usually take).
- below ${FIT_MIN}: their profile excludes this job, or they're the wrong kind of pro for it.

reason: one plain sentence for the homeowner (max 20 words) saying why this pro fits, e.g. "Focuses on bathroom ceilings and is 3 km away." Only cite what their profile says or their distance; never invent claims. No prices. The homeowner reads it, so follow the wording rules:
${policyLines(t)}
${SHORT_LINE_RULES}

List the pros from best to worst, so your order matches your scores.

Include every pro exactly once, by provider_id.
${UNTRUSTED_NOTE}`;
}

/** A pro's own description and interview facts, tagged as pro-written for the agents. */
export function proProfileBlock(p: Provider): string {
  return [`<pro_profile>`, `Description: ${p.description?.trim() || "(none)"}`, ...profileLines(p), `</pro_profile>`].join("\n");
}

/** The structured facts from a finished profile interview. */
export function profileLines(p: Provider): string[] {
  const f = p.profile?.stage === "complete" ? p.profile.facts : null;
  if (!f) return [];
  return [
    f.specialties.length ? `Specialties: ${f.specialties.join("; ")}` : "",
    f.jobSizes ? `Job sizes: ${f.jobSizes}` : "",
    f.availability ? `Availability: ${f.availability}` : "",
    f.notes ? `Other: ${f.notes}` : "",
  ].filter(Boolean);
}

export type FitCandidate = { provider: Provider; distanceKm: number; etaMinutes: number };

/** The job as plain lines for an agent prompt (shared with the pricing agent). */
export function jobLines(input: { template: Template; spec: GeneratedSpec; answers: Record<string, string>; notes: string | null }): string[] {
  const t = input.template;
  const answers = t.questions.filter((q) => input.answers[q.id]).map((q) => `- ${q.q} ${input.answers[q.id]}`);
  return [
    `Trade: ${t.label}`,
    `Title: ${input.spec.title}`,
    `Summary: ${input.spec.summary}`,
    `Severity: ${input.spec.severity}/5, affected area about ${input.spec.areaM2} m²`,
    ...Object.entries(input.spec.fields).map(([k, v]) => `${t.output_labels[k] ?? k}: ${v}`),
    answers.length ? `Homeowner answers:\n${answers.join("\n")}` : "",
    input.notes ? `<homeowner_note>\n${input.notes}\n</homeowner_note>` : "",
  ].filter(Boolean);
}

/** Ranked fit for these candidates, or null (fake AI, no candidates, or the AI failed: callers keep the default order). */
export async function rankFit(input: {
  template: Template;
  spec: GeneratedSpec;
  answers: Record<string, string>;
  notes: string | null;
  candidates: FitCandidate[];
}): Promise<ProviderFit[] | null> {
  if (fakeAi() || input.candidates.length === 0) return null;
  const job = jobLines(input);
  const pros = input.candidates.map(({ provider: p, distanceKm, etaMinutes }) =>
    [
      `<pro provider_id="${p.id}">`,
      `Name: ${p.name}`,
      `Distance: ${distanceKm} km (about ${etaMinutes} min away)`,
      `Rating: ${p.rating.toFixed(1)} from ${p.ratingCount} reviews`,
      `Profile: ${profileStatus(p).replace("_", " ")}`,
      proProfileBlock(p),
      `</pro>`,
    ].join("\n"),
  );

  const ids = new Set(input.candidates.map((c) => c.provider.id));
  let out: z.infer<typeof fitSchema>;
  try {
    out = await parseComplete(
      fitSchema,
      {
        system: fitSystem(input.template),
        effort: "low",
        content: [{ type: "text", text: `<job>\n${job.join("\n")}\n</job>\n\n<pros>\n${pros.join("\n\n")}\n</pros>` }],
      },
      (o) => [...ids].every((id) => o.ranking.some((r) => r.provider_id === id && cleanLine(r.reason))),
    );
  } catch (err) {
    // Matching still works without the agent: fall back to rating + distance.
    console.error("Matching agent failed; using the default order", err);
    return null;
  }

  const seen = new Set<number>();
  const fit: ProviderFit[] = [];
  for (const r of out.ranking) {
    if (!ids.has(r.provider_id) || seen.has(r.provider_id)) continue;
    seen.add(r.provider_id);
    fit.push({ providerId: r.provider_id, score: Math.min(100, Math.max(0, Math.round(r.score))), reason: cleanLine(r.reason) });
  }
  // Order by score (stable, so the agent's order breaks ties): the list order sometimes disagrees with the scores.
  return fit.sort((a, b) => b.score - a.score);
}
