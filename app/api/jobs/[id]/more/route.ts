import { z } from "zod";
import { route, toId } from "@/lib/api";
import { HttpError, requireApiUser } from "@/lib/auth";
import { loadJobFor, transition } from "@/lib/jobs";

const body = z.object({ reply: z.string().trim().max(2000).optional() });

/** Homeowner answers a provider's "Ask for more". Photos go up first via /photos. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireApiUser("customer");
  const job = loadJobFor(user, toId(id));
  if (job.status !== "more_info" || !job.moreInfo) throw new HttpError(409, "Nobody is waiting on more info for this job.");
  const { reply } = body.parse(await req.json());
  transition(job, "open", user, {
    note: reply ? `Homeowner replied: ${reply}` : "Homeowner sent the requested photos",
    set: { moreInfo: { ...job.moreInfo, reply: reply || undefined } },
  });
  return { ok: true };
});
