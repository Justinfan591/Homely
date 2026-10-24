import { z } from "zod";
import { route, toId } from "@/lib/api";
import { HttpError, requireApiUser } from "@/lib/auth";
import { loadJobFor, matchingProviders, transition } from "@/lib/jobs";

const body = z.object({ providerId: z.number().int(), note: z.string().trim().max(500).optional() });

export const POST = route<{ id: string }>(async (req, { id }) => {
  const agent = await requireApiUser("agent");
  const job = loadJobFor(agent, toId(id));
  const { providerId, note } = body.parse(await req.json());
  const match = matchingProviders(job).find((m) => m.user.id === providerId);
  if (!match) throw new HttpError(400, "That provider doesn't cover this trade and area.");
  transition(job, "assigned", agent, {
    note: note || `Assigned to ${match.user.name} by ${agent.name}`,
    set: { providerId, agentId: agent.id },
  });
  return { ok: true };
});
