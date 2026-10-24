import { route, toId } from "@/lib/api";
import { decline, jobDetail, providerFromRequest } from "@/lib/scope/pro";

/**
 * Decline a job routed to this pro (the homeowner is offered a virtual call), or pass on an open request
 * (it stays open for the other pros and leaves this pro's queue). Returns the job detail, or `{ passed: true }`.
 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const p = providerFromRequest(req);
  const jobId = toId(id);
  const job = decline(p, jobId);
  if (job.providerId !== p.id) return { passed: true as const };
  return jobDetail(p, jobId);
});
