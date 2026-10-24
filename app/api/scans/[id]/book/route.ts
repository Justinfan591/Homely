import { z } from "zod";
import { route } from "@/lib/api";
import { freshScan, homeownerScan } from "@/lib/scope/routes";
import { book } from "@/lib/scope/service";

const body = z.object({ providerId: z.number().int().positive(), slot: z.string().optional() });

/** "Book [Provider] - [time]": sends the spec to that pro's New queue. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, scan, home } = await homeownerScan(id);
  const { providerId, slot } = body.parse(await req.json());
  book(scan, home, providerId, slot);
  return freshScan(user, scan.id);
});
