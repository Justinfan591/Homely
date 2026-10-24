import { z } from "zod";
import { route, toId } from "@/lib/api";
import { askForMore, jobDetail, providerFromRequest } from "@/lib/scope/pro";

const body = z.object({
  shotIds: z.array(z.string()).max(20).default([]),
  questionIds: z.array(z.string()).max(20).default([]),
  message: z.string().max(1000).nullish(),
});

/** Ask the homeowner to rescan only these shots/questions, or answer a free-text request. Returns the updated job detail. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const p = providerFromRequest(req);
  const jobId = toId(id);
  const b = body.parse(await req.json());
  askForMore(p, jobId, { shotIds: b.shotIds, questionIds: b.questionIds, message: b.message ?? null });
  return jobDetail(p, jobId);
});
