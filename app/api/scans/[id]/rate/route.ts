import { z } from "zod";
import { route } from "@/lib/api";
import { freshScan, homeownerScan } from "@/lib/scope/routes";
import { rate } from "@/lib/scope/service";
import { REVIEW_TAGS } from "@/shared/scope";

const body = z.object({
  stars: z.number().int().min(1).max(5),
  tags: z.array(z.enum(REVIEW_TAGS)).max(REVIEW_TAGS.length).optional(),
  note: z.string().max(1000).nullish(),
});

/** 1-5 stars (plus optional tags and a note) once the job is done. Updates the provider's rating. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, scan } = await homeownerScan(id);
  const input = body.parse(await req.json());
  rate(scan, input.stars, { tags: input.tags, note: input.note });
  return freshScan(user, scan.id);
});
