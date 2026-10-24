import { z } from "zod";
import { route } from "@/lib/api";
import { freshScan, homeownerScan } from "@/lib/scope/routes";
import { rate } from "@/lib/scope/service";

const body = z.object({ stars: z.number().int().min(1).max(5) });

/** 1-5 stars once the job is done. Updates the provider's rating. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, scan } = await homeownerScan(id);
  rate(scan, body.parse(await req.json()).stars);
  return freshScan(user, scan.id);
});
