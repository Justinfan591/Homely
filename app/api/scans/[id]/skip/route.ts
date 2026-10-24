import { z } from "zod";
import { route } from "@/lib/api";
import { homeownerScan } from "@/lib/scope/routes";
import { skipShot } from "@/lib/scope/service";

const body = z.object({ shotId: z.string().min(1) });

/** Skip an optional shot that doesn't apply (e.g. no wall next to it). */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { scan } = await homeownerScan(id);
  return skipShot(scan, body.parse(await req.json()).shotId);
});
