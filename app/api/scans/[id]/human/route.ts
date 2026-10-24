import { route } from "@/lib/api";
import { freshScan, homeownerScan } from "@/lib/scope/routes";
import { askForHuman } from "@/lib/scope/service";

/** Homeowner would rather talk to a person. Same as a low-confidence handoff. */
export const POST = route<{ id: string }>(async (_req, { id }) => {
  const { user, scan, home } = await homeownerScan(id);
  askForHuman(scan, home);
  return freshScan(user, scan.id);
});
