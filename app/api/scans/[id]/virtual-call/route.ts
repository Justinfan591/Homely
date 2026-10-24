import { route } from "@/lib/api";
import { freshScan, homeownerScan } from "@/lib/scope/routes";
import { requestVirtualCall } from "@/lib/scope/service";

/** No pro in range: request a virtual call with the trade's partner (Mold Busters for mold). */
export const POST = route<{ id: string }>(async (_req, { id }) => {
  const { user, scan } = await homeownerScan(id);
  requestVirtualCall(scan);
  return freshScan(user, scan.id);
});
