import { route } from "@/lib/api";
import { freshScan, homeownerScan } from "@/lib/scope/routes";
import { reopenForMore } from "@/lib/scope/service";

/** The pro asked for more: reopen capture for just those items. */
export const POST = route<{ id: string }>(async (_req, { id }) => {
  const { user, scan } = await homeownerScan(id);
  reopenForMore(scan);
  return freshScan(user, scan.id);
});
