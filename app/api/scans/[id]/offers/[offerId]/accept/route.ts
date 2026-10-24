import { route, toId } from "@/lib/api";
import { addToCalendar } from "@/lib/scope/pro";
import { freshScan, homeownerScan } from "@/lib/scope/routes";
import { acceptOffer } from "@/lib/scope/service";

/** The homeowner picks one offer. That pro gets the job; every other offer closes. */
export const POST = route<{ id: string; offerId: string }>(async (_req, { id, offerId }) => {
  const { user, scan } = await homeownerScan(id);
  const { provider, jobId } = acceptOffer(scan, toId(offerId));
  // The booking stands even if Google is unreachable.
  await addToCalendar(provider, jobId).catch((err) => console.error("Google Calendar:", err));
  return freshScan(user, scan.id);
});
