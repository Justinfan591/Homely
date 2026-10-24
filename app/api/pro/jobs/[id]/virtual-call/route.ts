import { route, toId } from "@/lib/api";
import { routeToVirtualCall, jobDetail, providerFromRequest } from "@/lib/scope/pro";


/** Needs review: route the homeowner to a virtual call. Returns the updated job detail. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const p = providerFromRequest(req);
  const jobId = toId(id);
  routeToVirtualCall(p, jobId);
  return jobDetail(p, jobId);
});
