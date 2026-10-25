import { z } from "zod";
import { route } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { reverseGeocode } from "@/lib/geocode";

const query = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

/** "Use my current location": coordinates → a street address for the home field. */
export const GET = route(async (req) => {
  await requireApiUser("customer");
  const { lat, lng } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return { address: await reverseGeocode(lat, lng) };
});
