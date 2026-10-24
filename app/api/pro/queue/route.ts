import { route } from "@/lib/api";
import { providerFromRequest, providerInfo, queue } from "@/lib/scope/pro";
import type { ProQueueResponse } from "@/shared/scope";

/** Queue tabs: new, review (handoff / virtual call), active, done. Poll every 2s. */
export const GET = route(async (req): Promise<ProQueueResponse> => {
  const p = providerFromRequest(req);
  return { provider: providerInfo(p), tabs: queue(p) };
});
