import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { route, toId } from "@/lib/api";
import { HttpError, requireApiUser } from "@/lib/auth";
import { loadJobFor } from "@/lib/jobs";
import { readPhoto } from "@/lib/photos";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireApiUser();
  const photo = db.select().from(schema.photos).where(eq(schema.photos.id, toId(id))).get();
  if (!photo) throw new HttpError(404, "Not found.");
  loadJobFor(user, photo.jobId); // access check
  return new Response(new Uint8Array(await readPhoto(photo)), {
    headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=3600" },
  });
});
