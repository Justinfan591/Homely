import { route, toId } from "@/lib/api";
import { HttpError, requireApiUser } from "@/lib/auth";
import { loadJobFor, transition } from "@/lib/jobs";

/** First provider to accept an open job gets it. */
export const POST = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireApiUser("provider");
  const job = loadJobFor(user, toId(id));
  if (job.status !== "open") throw new HttpError(409, "Sorry, this job was already taken.");
  transition(job, "assigned", user, { note: `Accepted by ${user.name}`, set: { providerId: user.id } });
  return { ok: true };
});
