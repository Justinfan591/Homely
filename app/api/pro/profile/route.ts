import { z } from "zod";
import { route } from "@/lib/api";
import { providerFromRequest } from "@/lib/scope/pro";
import { answer, profileView, retry, saveDescription, savePricing, saveWebsite, skip, startInterview } from "@/lib/scope/profile";
import { profilePricingSchema } from "@/shared/scope";

export const GET = route(async (req) => profileView(providerFromRequest(req)));

const body = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["start", "retry", "skip"]) }),
  z.object({ action: z.literal("answer"), answer: z.array(z.string()).max(10), note: z.string().max(500).nullish() }),
  z.object({ action: z.literal("pricing"), pricing: profilePricingSchema }),
  z.object({ action: z.literal("description"), description: z.string().max(5000) }),
  z.object({ action: z.literal("website"), url: z.string().max(500) }),
]);

/** One step of the profile interview. "pricing" turns the pro's numbers into the rate card (the AI never prices). */
export const POST = route(async (req) => {
  const p = providerFromRequest(req);
  const b = body.parse(await req.json());
  switch (b.action) {
    case "start":
      return profileView(await startInterview(p));
    case "retry":
      return profileView(await retry(p));
    case "skip":
      return profileView(await skip(p));
    case "answer":
      return profileView(await answer(p, { answer: b.answer, note: b.note ?? null }));
    case "pricing":
      return profileView(savePricing(p, b.pricing));
    case "description":
      return profileView(saveDescription(p, b.description));
    case "website":
      return profileView((await saveWebsite(p, b.url)).provider);
  }
});
