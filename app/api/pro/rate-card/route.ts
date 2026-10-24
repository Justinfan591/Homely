import { route } from "@/lib/api";
import { providerFromRequest, providerInfo, saveRateCard } from "@/lib/scope/pro";
import { rateCardSchema } from "@/shared/scope";

export const GET = route(async (req) => ({ rateCard: providerFromRequest(req).rateCard }));

/** Save: every quote from now on uses it (pricing is deterministic). */
export const PUT = route(async (req) => {
  const p = providerFromRequest(req);
  return { provider: providerInfo(saveRateCard(p, rateCardSchema.parse(await req.json()))) };
});
