import { route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { homeownerScan } from "@/lib/scope/routes";
import { recordShot } from "@/lib/scope/service";

// The vision check can take a few seconds.
export const maxDuration = 60;

/** Upload one shot (form fields: shotId, photo). Returns the vision check result. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { scan } = await homeownerScan(id);
  const form = await req.formData();
  const shotId = String(form.get("shotId") ?? "");
  const photo = form.get("photo");
  if (!(photo instanceof File)) throw new HttpError(400, "No photo received.");
  return recordShot(scan, shotId, photo);
});
