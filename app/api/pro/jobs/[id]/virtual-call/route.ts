import { route, toId } from "@/lib/api";
import { jobDetail, providerById, providerFromRequest, routeToVirtualCall } from "@/lib/scope/pro";

/**
 * Needs review: route the homeowner to a virtual call. The job moves to the trade's virtual-call
 * partner, who may be another pro; returns the updated job as its new owner sees it.
 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const p = providerFromRequest(req);
  const jobId = toId(id);
  const job = routeToVirtualCall(p, jobId);
  return jobDetail(job.providerId && job.providerId !== p.id ? providerById(job.providerId) : p, jobId);
});
