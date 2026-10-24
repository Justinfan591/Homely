import { z } from "zod";
import { route } from "@/lib/api";
import { freshScan, homeownerScan } from "@/lib/scope/routes";
import { setMark } from "@/lib/scope/service";

const body = z.object({ shotId: z.string().min(1).max(60), x: z.number().min(0).max(100), y: z.number().min(0).max(100) });

/** "Move the dot to the leak": where on one photo the problem is. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, scan } = await homeownerScan(id);
  setMark(scan, body.parse(await req.json()));
  return freshScan(user, scan.id);
});
