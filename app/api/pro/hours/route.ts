import { route } from "@/lib/api";
import { providerById, providerFromRequest, saveHours } from "@/lib/scope/pro";
import { DEFAULT_HOURS } from "@/shared/scope";

/** Working hours: 7 days (Monday first) × 48 half-hours, true = open. */
export const GET = route(async (req) => ({ hours: providerFromRequest(req).hours ?? DEFAULT_HOURS }));

export const PUT = route(async (req) => {
  const p = providerFromRequest(req);
  saveHours(p, ((await req.json()) as { hours?: unknown }).hours);
  return { hours: providerById(p.id).hours };
});
