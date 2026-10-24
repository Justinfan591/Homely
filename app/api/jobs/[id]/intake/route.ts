import { z } from "zod";
import { route, toId } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { loadJobFor } from "@/lib/jobs";
import { runIntakeTurn } from "@/lib/intake/agent";

// Claude can take a while to look at photos.
export const maxDuration = 120;

const body = z.object({
  text: z.string().trim().max(2000).optional(),
  answers: z
    .array(z.object({ question: z.string().max(500), answer: z.string().max(1000) }))
    .max(10)
    .optional(),
  skippedPhotos: z.boolean().optional(),
});

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireApiUser("customer");
  const job = loadJobFor(user, toId(id));
  await runIntakeTurn(job, user, body.parse(await req.json()));
  return { ok: true };
});
