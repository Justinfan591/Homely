import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { route, toId } from "@/lib/api";
import { HttpError, getCurrentUser } from "@/lib/auth";
import { canProviderSee, providerFromRequest } from "@/lib/scope/pro";
import { readScanPhoto, validPhotoSignature } from "@/lib/scope/photos";
import { jobOfScan, loadScanFor } from "@/lib/scope/service";

/** A scan photo: via its signed `src` link, the homeowner's bearer token, or ?provider=<id> for /pro. */
export const GET = route<{ id: string }>(async (req, { id }) => {
  const photo = db.select().from(schema.scanPhotos).where(eq(schema.scanPhotos.id, toId(id))).get();
  if (!photo) throw new HttpError(404, "Not found.");
  const params = new URL(req.url).searchParams;

  if (params.has("sig")) {
    if (!validPhotoSignature(photo.id, params.get("exp"), params.get("sig"))) throw new HttpError(403, "This photo link has expired. Reload the page.");
  } else if (params.has("provider")) {
    const provider = providerFromRequest(req);
    const scan = db.select().from(schema.scans).where(eq(schema.scans.id, photo.scanId)).get();
    const job = jobOfScan(photo.scanId);
    if (!scan || !job || !canProviderSee(provider, job, scan.trade)) throw new HttpError(404, "Not found.");
  } else {
    const user = await getCurrentUser();
    if (!user) throw new HttpError(401, "Please sign in.");
    loadScanFor(user, photo.scanId); // access check
  }
  return new Response(new Uint8Array(await readScanPhoto(photo)), {
    headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=3600" },
  });
});
