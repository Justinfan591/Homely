import { z } from "zod";
import { route } from "@/lib/api";
import { freshScan, homeownerScan } from "@/lib/scope/routes";
import { describeInstead } from "@/lib/scope/service";

const body = z.object({ description: z.string().trim().min(3).max(2000) });

/** "No photos, but you suspect mold?": skip the photos and describe the symptoms and where instead. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, scan } = await homeownerScan(id);
  describeInstead(scan, body.parse(await req.json()).description);
  return freshScan(user, scan.id);
});
