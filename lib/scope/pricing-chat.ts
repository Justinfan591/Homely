import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { Provider } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { toRateCard, type PricingMessage, type ProviderPricing, type RateCard } from "@/shared/scope";
import { PLAIN_ASK, UNTRUSTED_NOTE, cleanLine, fakeAi, parse } from "./ai";
import { getTemplate } from "./templates";

/**
 * The pricing agent (/pro → Pricing): the pro tells it in their own words how they charge, and it drafts
 * their rates (call-out with the first hour, hourly, parts markup, and the most it may quote without
 * asking) plus what it should ask homeowners on their jobs. Nothing is used until the pro approves it.
 * Each job's price is then code: those rates × the spec agent's estimate of hours and parts.
 */

const MAX_MESSAGES = 40;
const MAX_ASKS = 6;

const tradeOf = (p: Provider) => {
  try {
    return getTemplate(p.trades[0] ?? "handyman");
  } catch {
    return null;
  }
};

/** The pro's pricing chat, or a fresh one that opens with the agent's first question. */
export function pricingState(p: Provider): ProviderPricing {
  if (p.pricing) return { ...p.pricing, draft: toRateCard(p.pricing.draft) };
  const t = tradeOf(p);
  return {
    messages: [{ who: "agent", text: `How do you usually charge for a ${t ? t.label.toLowerCase() : "typical"} job?` }],
    draft: toRateCard(p.rateCard),
    asks: t ? t.questions.slice(0, 4).map((q) => q.q) : [],
    status: "draft",
    approvedAt: null,
  };
}

const save = (p: Provider, pricing: ProviderPricing, set: Partial<Pick<Provider, "rateCard">> = {}) =>
  db.update(schema.providers).set({ pricing, ...set }).where(eq(schema.providers.id, p.id)).returning().get();

const turnSchema = z.object({
  reply: z.string(),
  call_out: z.number(),
  hourly: z.number(),
  parts_markup_pct: z.number(),
  approve_over: z.number(),
  asks: z.array(z.string()),
});

function system(p: Provider) {
  const t = tradeOf(p);
  return `You help a home-service pro set up how they're quoted on Homely, a marketplace where homeowners describe a problem with photos and get offers. You chat with the pro and keep a draft of their rates on the side, which they approve when it looks right.

How every job is priced (by code, from your draft): call_out (the visit and the first hour) + each hour after × hourly + parts at cost × (1 + parts_markup_pct / 100). A spec agent estimates the hours and parts for each job from the homeowner's photos and answers. Quotes up to approve_over are sent to homeowners automatically; anything above it goes to the pro to review first. All amounts are Canadian dollars.

The pro: ${p.name}. Trades: ${p.trades.join(", ")}.${t ? ` Typical job: ${t.label.toLowerCase()} (${t.description}).` : ""}

Each turn:
- reply: one or two short, friendly sentences. Confirm what you understood, then ask for the next missing piece: their call-out and what it includes, the hourly rate after that, how they charge for parts, and the most you should quote without asking them. When you have all four, say the draft is ready and ask them to approve or tell you what to change.
- call_out, hourly, parts_markup_pct, approve_over: the full draft after this turn. Keep the current value for anything the pro hasn't changed. Round to whole dollars and percents.
- asks: ${3}-${MAX_ASKS} things the agent should ask homeowners on this pro's jobs to estimate time and parts well (short questions or photo requests, e.g. "Is water still running?", "Photo of the fixture and the pipe under it"). Keep the current list unless the pro asks to change it. ${PLAIN_ASK}
Never invent prices the pro didn't give. If they give a range, use the middle and say so.
${UNTRUSTED_NOTE}`;
}

const asText = (m: PricingMessage[]) => m.map((x) => `${x.who === "pro" ? "Pro" : "You"}: ${x.text}`).join("\n");

/** Fake AI: pull the numbers out of the message by keyword, so e2e can drive the chat. */
function fakeTurn(text: string, draft: RateCard, asks: string[]) {
  const near = (re: RegExp) => {
    const m = text.match(re);
    return m ? Number(m[1].replace(/,/g, "")) : undefined;
  };
  const next: RateCard = {
    callOut: near(/\$?\s*([\d,]+)[^\d%$]{0,20}call[- ]?out/i) ?? near(/call[- ]?out[^\d$]{0,20}\$?\s*([\d,]+)/i) ?? draft.callOut,
    hourly: near(/\$?\s*([\d,]+)[^\d%$]{0,12}(?:an|per|\/)\s*h(?:ou)?r/i) ?? draft.hourly,
    partsMarkupPct: near(/([\d.]+)\s*%/) ?? draft.partsMarkupPct,
    approveOver: near(/(?:up to|most|max(?:imum)?|over|above)[^\d$]{0,20}\$?\s*([\d,]+)/i) ?? draft.approveOver,
  };
  return { reply: "Got it. I've updated the draft on the right. Approve it when it looks right, or tell me what to change.", draft: next, asks };
}

/** One chat turn, without saving: the agent's reply, the updated draft and asks. Exported for scripts/eval-agents.ts. */
export async function pricingTurn(p: Provider, state: ProviderPricing, messages: PricingMessage[]): Promise<{ reply: string; draft: RateCard; asks: string[] }> {
  const text = messages.at(-1)?.text ?? "";
  if (fakeAi()) return fakeTurn(text, state.draft, state.asks);
  const res = await parse(turnSchema, {
    system: system(p),
    effort: "low",
    content: [
      {
        type: "text",
        text: `<current_draft>\ncall_out: ${state.draft.callOut}\nhourly: ${state.draft.hourly}\nparts_markup_pct: ${state.draft.partsMarkupPct}\napprove_over: ${state.draft.approveOver}\nasks:\n${state.asks.map((a) => `- ${a}`).join("\n") || "(none yet)"}\n</current_draft>\n\n<interview>\n${asText(messages)}\n</interview>`,
      },
    ],
  });
  const n = (v: number, max: number, fallback: number) => (Number.isFinite(v) && v >= 0 ? Math.min(max, Math.round(v)) : fallback);
  return {
    reply: cleanLine(res.reply, 400) || "Got it. Anything else to change?",
    draft: {
      callOut: n(res.call_out, 100000, state.draft.callOut),
      hourly: n(res.hourly, 100000, state.draft.hourly),
      partsMarkupPct: n(res.parts_markup_pct, 200, state.draft.partsMarkupPct),
      approveOver: n(res.approve_over, 100000, state.draft.approveOver),
    },
    asks: [...new Set(res.asks.map((a) => cleanLine(a, 120)).filter(Boolean))].slice(0, MAX_ASKS),
  };
}

/** The pro's message → the agent's reply and an updated draft. Approved rates stay live until the next approve. */
export async function sendPricingMessage(p: Provider, input: string): Promise<Provider> {
  const text = input.trim().slice(0, 1000);
  if (!text) throw new HttpError(400, "Write a message first.");
  const state = pricingState(p);
  const messages: PricingMessage[] = [...state.messages, { who: "pro" as const, text }].slice(-MAX_MESSAGES);
  const out = await pricingTurn(p, state, messages);
  const changed = JSON.stringify(out.draft) !== JSON.stringify(state.draft) || JSON.stringify(out.asks) !== JSON.stringify(state.asks);
  return save(p, {
    messages: [...messages, { who: "agent" as const, text: out.reply }].slice(-MAX_MESSAGES),
    draft: out.draft,
    asks: out.asks.length ? out.asks : state.asks,
    // Any change needs approving again; the last approved rates (rateCard) keep pricing jobs meanwhile.
    status: changed ? "draft" : state.status,
    approvedAt: state.approvedAt,
  });
}

/** The pro approves the draft: it becomes their rate card, and the agent starts quoting with it. */
export function approvePricing(p: Provider): Provider {
  const state = pricingState(p);
  return save(p, { ...state, status: "live", approvedAt: new Date().toISOString() }, { rateCard: state.draft });
}

/** Approved pricing: the agent sends offers for this pro on its own (up to their limit). */
export const pricingLive = (p: Pick<Provider, "pricing">) => p.pricing?.status === "live" || (!!p.pricing?.approvedAt && p.pricing.status === "draft");
