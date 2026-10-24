import { z } from "zod";
import { route } from "@/lib/api";
import { freshScan, homeownerScan } from "@/lib/scope/routes";
import { requestOffers } from "@/lib/scope/service";

const body = z.object({ slot: z.string().optional() });

/** "Get offers": sends the spec to every matching pro at once. `slot` is the homeowner's preferred time. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, scan, home } = await homeownerScan(id);
  const { slot } = body.parse(await req.json().catch(() => ({})));
  requestOffers(scan, home, slot);
  return freshScan(user, scan.id);
});
