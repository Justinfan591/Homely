import { z } from "zod";
import { route } from "@/lib/api";
import { freshScan, homeownerScan } from "@/lib/scope/routes";
import { finishScan } from "@/lib/scope/service";

export const maxDuration = 120;

const body = z.object({
  answers: z.record(z.string(), z.string().max(200)),
  notes: z.string().max(1000).nullish(),
});

/** Save the tap answers (+ optional note) and generate the JobSpec. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, scan, home } = await homeownerScan(id);
  await finishScan(scan, home, body.parse(await req.json()));
  return freshScan(user, scan.id);
});
