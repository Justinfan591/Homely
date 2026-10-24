import { z } from "zod";
import { JOB_STATUSES } from "@/db/schema";
import { route, toId } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { loadJobFor, transition } from "@/lib/jobs";

const body = z.object({ to: z.enum(JOB_STATUSES), note: z.string().trim().max(500).optional() });

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireApiUser();
  const job = loadJobFor(user, toId(id));
  const { to, note } = body.parse(await req.json());
  // An agent who pulls a job back for review takes it over from the provider.
  const set = to === "agent_review" && user.role === "agent" ? { agentId: user.id, providerId: null } : undefined;
  transition(job, to, user, { note, set });
  return { ok: true };
});
