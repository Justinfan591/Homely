import { z } from "zod";
import { route, toId } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { loadJobFor, transition } from "@/lib/jobs";

const body = z.object({ route: z.enum(["open", "agent"]), note: z.string().trim().max(500).optional() });

/** Customer chooses: send to local pros, or ask a support agent. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireApiUser("customer");
  const job = loadJobFor(user, toId(id));
  const data = body.parse(await req.json());
  const to = data.route === "open" ? "open" : "agent_review";
  transition(job, to, user, {
    note: data.note || (to === "open" ? "Sent to local pros" : "Customer asked for a support agent"),
    set: { route: data.route },
  });
  return { ok: true };
});
