import { z } from "zod";
import { route, toId } from "@/lib/api";
import { jobDetail, providerFromRequest, sendOffer, withdrawOffer } from "@/lib/scope/pro";

const body = z.object({ slot: z.string().min(1), price: z.number().positive() });

/** Send or update this pro's price and time on an open request. Any price; the rate card is only a suggestion. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const p = providerFromRequest(req);
  const jobId = toId(id);
  sendOffer(p, jobId, body.parse(await req.json()));
  return jobDetail(p, jobId);
});

/** Withdraw this pro's offer. The request stays open. */
export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const p = providerFromRequest(req);
  const jobId = toId(id);
  withdrawOffer(p, jobId);
  return jobDetail(p, jobId);
});
