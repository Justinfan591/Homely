import { z } from "zod";
import { route } from "@/lib/api";
import { providerFromRequest } from "@/lib/scope/pro";
import { approvePricing, pricingState, sendPricingMessage } from "@/lib/scope/pricing-chat";

/** The pro's pricing chat: messages, the draft rates, what the agent asks homeowners, and draft/live. */
export const GET = route(async (req) => pricingState(providerFromRequest(req)));

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("message"), message: z.string().min(1).max(1000) }),
  z.object({ action: z.literal("approve") }),
]);

/** "message": tell the pricing agent how you charge (it updates the draft). "approve": the draft becomes your rates. */
export const POST = route(async (req) => {
  const p = providerFromRequest(req);
  const b = body.parse(await req.json());
  return pricingState(b.action === "approve" ? approvePricing(p) : await sendPricingMessage(p, b.message));
});
