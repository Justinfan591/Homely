import { z } from "zod";
import { route } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { searchAddresses } from "@/lib/geocode";
import { homeOf } from "@/lib/scope/service";

const query = z.object({ q: z.string().max(200).default("") });

/** Address type-ahead for the home field. Leans towards the homeowner's saved home, else the demo city. */
export const GET = route(async (req) => {
  const user = await requireApiUser("customer");
  const { q } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const home = homeOf(user);
  return { suggestions: await searchAddresses(q, home ? { lat: home.lat, lng: home.lng } : undefined) };
});
