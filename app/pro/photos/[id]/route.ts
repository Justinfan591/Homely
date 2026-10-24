import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { route, toId } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { loadJobFor } from "@/lib/jobs";
import { readPhoto } from "@/lib/photos";
import { proProvider } from "@/lib/pro";

// Job photos for the /pro dashboard, which picks its provider with ?provider= instead of a sign-in token.
export const GET = route<{ id: string }>(async (req, { id }) => {
  const pro = proProvider(new URL(req.url).searchParams.get("provider"));
  if (!pro) throw new HttpError(404, "Not found.");
  const photo = db.select().from(schema.photos).where(eq(schema.photos.id, toId(id))).get();
  if (!photo) throw new HttpError(404, "Not found.");
  loadJobFor(pro.user, photo.jobId); // access check
  return new Response(new Uint8Array(await readPhoto(photo)), {
    headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=3600" },
  });
});
