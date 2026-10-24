import { z } from "zod";
import { route } from "@/lib/api";
import { freshScan, homeownerScan } from "@/lib/scope/routes";
import { book } from "@/lib/scope/service";

const body = z.object({ providerId: z.number().int().positive() });

/** "Book [Provider] - [time]": sends the spec to that pro's New queue. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, scan, home } = await homeownerScan(id);
  book(scan, home, body.parse(await req.json()).providerId);
  return freshScan(user, scan.id);
});
