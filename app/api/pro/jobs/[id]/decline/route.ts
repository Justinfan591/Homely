import { route, toId } from "@/lib/api";
import { decline, jobDetail, providerFromRequest } from "@/lib/scope/pro";


/** Decline; the homeowner is offered the next pro or a virtual call. Returns the updated job detail. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const p = providerFromRequest(req);
  const jobId = toId(id);
  decline(p, jobId);
  return jobDetail(p, jobId);
});
