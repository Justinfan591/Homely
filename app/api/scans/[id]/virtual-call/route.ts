import { z } from "zod";
import { route } from "@/lib/api";
import { freshScan, homeownerScan } from "@/lib/scope/routes";
import { requestVirtualCall } from "@/lib/scope/service";

const body = z.object({ slot: z.string().optional() });

/** No pro in range: request a virtual call with the trade's partner (Mold Busters for mold). Optional preferred slot. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, scan } = await homeownerScan(id);
  const { slot } = body.parse(await req.json().catch(() => ({})));
  requestVirtualCall(scan, slot);
  return freshScan(user, scan.id);
});
