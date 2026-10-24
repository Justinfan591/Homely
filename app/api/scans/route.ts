import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError, requireApiUser } from "@/lib/auth";
import { homeOf, startScan } from "@/lib/scope/service";

const body = z.object({ trade: z.string().min(1).max(60), description: z.string().max(4000).nullish() });

/** Homeowner taps "Scan a problem" and picks a trade. */
export const POST = route(async (req) => {
  const user = await requireApiUser("customer");
  const home = homeOf(user);
  if (!home) throw new HttpError(409, "Set your home location first.");
  const input = body.parse(await req.json());
  const scan = startScan(home, input.trade, input.description);
  return { id: scan.id };
});
