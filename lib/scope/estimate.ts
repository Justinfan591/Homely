import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { Home } from "@/db/schema";
import { DEFAULT_RATE_CARDS, FALLBACK_RATE_CARD, OFFER_MAX_PRICE, PRICE_SPREAD, quote, type Template } from "@/shared/scope";
import { SHORT_LINE_RULES, UNTRUSTED_NOTE, cleanLine, fakeAi, parse, policyLines, type GeneratedSpec } from "./ai";
import { jobLines } from "./fit";

/**
 * The estimate agent: the homeowner always gets a price. When no pro in range has a rate card to price
 * the job, Claude gives a best-guess range for the home's area. Without the AI it falls back to the
 * median price from every pro in this trade (any distance), then to a typical rate card for the trade.
 */

export type Estimate = { low: number; high: number; basis: string };

const MIN_PRICE = 50;
const round5 = (n: number) => Math.round(n / 5) * 5;
const bound = (n: number) => Math.min(OFFER_MAX_PRICE, Math.max(MIN_PRICE, round5(n)));

const estimateSchema = z.object({ low_cad: z.number(), high_cad: z.number(), basis: z.string() });

function estimateSystem(t: Template) {
  return `You give a homeowner a best-guess price range for one ${t.label.toLowerCase()} job, before any pro has quoted it.

No pro near this home has prices for this job, so your range is what the homeowner sees. Always give a range: never refuse, and never answer 0.

How to price:
- A realistic total in Canadian dollars (CAD) for a licensed, insured pro in the homeowner's area: the service-call or call-out fee, labour and typical materials.
- Use the home's location (city, region, country) for local labour rates, and the home type for access (apartment or condo: building rules, stairs, parking; house: attics, crawl spaces, exterior).
- Size the work from the job text: severity, affected area, access, materials, urgency. Only what the text states.
- Keep the range honest: about ±15% around your best price when the job is clear, wider (up to about ±40%) when the job text is vague or the confidence is low.

basis: one plain sentence for the homeowner (max 15 words) on what the range covers, e.g. "Typical for a small ceiling repair in Toronto, including the call-out fee." Never mention percentages.
Wording rules (never diagnose):
${policyLines(t)}
${SHORT_LINE_RULES}
${UNTRUSTED_NOTE}`;
}

/** The middle formula price across every active pro in this trade, or the trade's typical rate card. */
function rateCardEstimate(trade: string, spec: GeneratedSpec): Estimate {
  const prices = db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.active, true))
    .all()
    .filter((p) => p.trades.includes(trade))
    .map((p) => quote(p.rateCard, spec).price)
    .sort((a, b) => a - b);
  const fromPros = prices.length > 0;
  const price = fromPros ? prices[Math.floor(prices.length / 2)] : quote(DEFAULT_RATE_CARDS[trade] ?? FALLBACK_RATE_CARD, spec).price;
  return {
    low: bound(price * (1 - PRICE_SPREAD)),
    high: bound(price * (1 + PRICE_SPREAD)),
    basis: fromPros ? "Based on what pros in our network charge for similar jobs." : "Based on typical rates for this kind of job.",
  };
}

/** A best-guess range for the homeowner. Never throws: falls back to rate cards when the AI is off or fails. */
export async function estimatePrice(input: {
  template: Template;
  spec: GeneratedSpec;
  answers: Record<string, string>;
  notes: string | null;
  home: Pick<Home, "address" | "homeType">;
}): Promise<Estimate> {
  const fallback = () => rateCardEstimate(input.template.trade, input.spec);
  if (fakeAi()) return fallback();

  try {
    const home = [`Address: ${input.home.address}`, input.home.homeType ? `Home type: ${input.home.homeType}` : ""].filter(Boolean).join("\n");
    const out = await parse(estimateSchema, {
      system: estimateSystem(input.template),
      effort: "low",
      content: [
        {
          type: "text",
          text: `<home>\n${home}\n</home>\n\n<job>\n${jobLines(input).join("\n")}\nSpec confidence: ${input.spec.confidence}\n</job>`,
        },
      ],
    });
    if (!Number.isFinite(out.low_cad) || !Number.isFinite(out.high_cad) || out.high_cad <= 0) return fallback();
    const low = bound(Math.min(out.low_cad, out.high_cad));
    const high = Math.max(low, bound(Math.max(out.low_cad, out.high_cad)));
    return { low, high, basis: cleanLine(out.basis, 160) || fallback().basis };
  } catch (err) {
    console.error("Estimate agent failed; using rate cards", err);
    return fallback();
  }
}
