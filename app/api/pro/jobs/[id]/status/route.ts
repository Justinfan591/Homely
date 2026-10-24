import { z } from "zod";
import { route, toId } from "@/lib/api";
import { advance, jobDetail, providerFromRequest } from "@/lib/scope/pro";

const body = z.object({ to: z.enum(["en_route", "done"]) });

/** Active job stepper: accepted, then en_route, then done. Returns the updated job detail. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const p = providerFromRequest(req);
  const jobId = toId(id);
  advance(p, jobId, body.parse(await req.json()).to);
  return jobDetail(p, jobId);
});
