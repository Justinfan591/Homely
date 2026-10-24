import { route } from "@/lib/api";
import { freshScan, homeownerScan } from "@/lib/scope/routes";
import { cancel } from "@/lib/scope/service";

/** Cancel the scan (and its job, if the pro hasn't accepted yet). */
export const POST = route<{ id: string }>(async (_req, { id }) => {
  const { user, scan } = await homeownerScan(id);
  cancel(scan);
  return freshScan(user, scan.id);
});
