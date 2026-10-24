import { z } from "zod";
import { route, toId } from "@/lib/api";
import { accept, jobDetail, providerFromRequest } from "@/lib/scope/pro";

const body = z.object({ slot: z.string().min(1), price: z.number().positive() });

/** Pick a slot and confirm the price (must stay within the calculated range). Returns the updated job detail. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const p = providerFromRequest(req);
  const jobId = toId(id);
  accept(p, jobId, body.parse(await req.json()));
  return jobDetail(p, jobId);
});
