import "server-only";
import { z } from "zod";
import type { Provider } from "@/db/schema";
import { PRICE_ADJUST_MAX, clampAdjust, quote, type PriceSuggestion, type Template } from "@/shared/scope";
import { SHORT_LINE_RULES, UNTRUSTED_NOTE, cleanLine, fakeAi, parseComplete, policyLines, type GeneratedSpec } from "./ai";
import { jobLines, proProfileBlock } from "./fit";

/**
 * The pricing agent: after a spec is generated, Claude suggests a price for each candidate pro.
 * It never writes a price. It picks a percentage change to that pro's rate-card price, based on
 * what the formula can't see (access, urgency, what the company includes or specializes in).
 * Code clamps it to ±PRICE_ADJUST_MAX% and does the maths (see suggestedQuote in shared/scope.ts).
 */

const priceSchema = z.object({
  suggestions: z.array(z.object({ provider_id: z.number(), adjust_pct: z.number(), reason: z.string() })),
});

function priceSystem(t: Template) {
  return `You suggest a fair price for each home-service pro on one homeowner job, so the pro can send an offer with one tap.

Each pro already has a formula price from their own rate card: call-out fee + price per m² × affected area, times a multiplier for severity. You don't write prices. For each pro you pick adjust_pct: a whole-number percentage change to their formula price, from -${PRICE_ADJUST_MAX} to +${PRICE_ADJUST_MAX}.

The job spec was written by a spec agent from the homeowner's photos and answers; you only see its text. The pro sees your suggested price and reason, can change the price, and sends it to the homeowner as an offer.

How to choose adjust_pct:
- Start from 0. Most jobs need little or no adjustment. Move it only for clear reasons the formula misses, and only for what the job text actually states: don't assume hard access, a leak or extra work the spec doesn't mention.
- Job work the formula misses: hard access (ceilings, attics, crawl spaces, height), difficult materials, a likely moisture source that needs extra work, a problem that has been visible for months or keeps coming back, an active leak or water (urgent).
- The pro's own profile: what they say they include (testing, containment, cleanup, warranty) or charge (a minimum charge), whether this job is their specialty, and whether it's outside the job sizes they say they take. A simple, small job can go below 0.
- Severity and area are already in the formula: don't adjust for them again.
- Different pros can get different adjustments for the same job; that's the point.
- How big: one minor factor is about 5-10; one clear major factor about 10-20; go past 25 only when the job text states several strong factors.

reason: one plain sentence for the pro (max 15 words) saying why, e.g. "Ceiling access and an active leak add work; your price includes testing." If adjust_pct is 0, say the job is standard for their prices. Never mention dollar amounts or percentages.
Wording rules (never diagnose):
${policyLines(t)}
${SHORT_LINE_RULES}

Include every pro exactly once, by provider_id.
${UNTRUSTED_NOTE}`;
}

/** Suggested adjustments for these pros, or null (no pros, or the AI failed: callers use the plain formula). */
export async function suggestPrices(input: {
  template: Template;
  spec: GeneratedSpec;
  answers: Record<string, string>;
  notes: string | null;
  providers: Provider[];
}): Promise<PriceSuggestion[] | null> {
  if (input.providers.length === 0) return null;
  // Fixed, predictable answer so e2e covers the suggestion path without an API key.
  if (fakeAi()) return input.providers.map((p) => ({ providerId: p.id, adjustPct: 10, reason: "Test suggestion." }));

  const pros = input.providers.map((p) => {
    const c = p.rateCard;
    const formula = quote(c, input.spec).price;
    return [
      `<pro provider_id="${p.id}">`,
      `Name: ${p.name}`,
      proProfileBlock(p),
      `Rate card: call-out $${c.base}, $${c.per_m2}/m², severity multipliers ${c.severity_multiplier.join(" / ")}`,
      `Formula price for this job: $${formula}`,
      `</pro>`,
    ].join("\n");
  });

  const ids = new Set(input.providers.map((p) => p.id));
  let out: z.infer<typeof priceSchema>;
  try {
    out = await parseComplete(
      priceSchema,
      {
        system: priceSystem(input.template),
        effort: "low",
        content: [{ type: "text", text: `<job>\n${jobLines(input).join("\n")}\n</job>\n\n<pros>\n${pros.join("\n\n")}\n</pros>` }],
      },
      (o) => [...ids].every((id) => o.suggestions.some((s) => s.provider_id === id && Number.isFinite(s.adjust_pct) && cleanLine(s.reason))),
    );
  } catch (err) {
    // Offers still work without the agent: the pro sees their plain formula price.
    console.error("Pricing agent failed; using the rate card formula", err);
    return null;
  }

  const seen = new Set<number>();
  const result: PriceSuggestion[] = [];
  for (const s of out.suggestions) {
    if (!ids.has(s.provider_id) || seen.has(s.provider_id) || !Number.isFinite(s.adjust_pct)) continue;
    seen.add(s.provider_id);
    result.push({ providerId: s.provider_id, adjustPct: clampAdjust(s.adjust_pct), reason: cleanLine(s.reason) });
  }
  return result;
}
