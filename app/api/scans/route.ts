import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError, requireApiUser } from "@/lib/auth";
import { homeOf, startScan } from "@/lib/scope/service";

const body = z.object({ trade: z.string().min(1).max(60) });

/** Homeowner taps "Scan a problem" and picks a trade. */
export const POST = route(async (req) => {
  const user = await requireApiUser("customer");
  const home = homeOf(user);
  if (!home) throw new HttpError(409, "Set your home location first.");
  const scan = startScan(home, body.parse(await req.json()).trade);
  return { id: scan.id };
});
