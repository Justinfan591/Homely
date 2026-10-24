import { route } from "@/lib/api";
import { HttpError, requireApiUser } from "@/lib/auth";
import { classifyTrade } from "@/lib/scope/ai";
import { checkImage } from "@/lib/scope/photos";
import { templates } from "@/lib/scope/templates";

export const maxDuration = 60;

/**
 * "Is this right?": picks the trade for what the homeowner said (form field `text`)
 * and their screening photo (optional field `photo`). Nothing is stored.
 */
export const POST = route(async (req) => {
  await requireApiUser("customer");
  const form = await req.formData();
  const text = String(form.get("text") ?? "").slice(0, 4000);
  const photo = form.get("photo");
  if (!text.trim() && !(photo instanceof File)) throw new HttpError(400, "Tell us or show us what's wrong first.");
  const image = photo instanceof File ? { data: Buffer.from(await photo.arrayBuffer()), type: checkImage(photo) } : null;
  return classifyTrade([...templates().values()], { text, image });
});
