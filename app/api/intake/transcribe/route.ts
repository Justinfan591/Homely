import { route } from "@/lib/api";
import { HttpError, requireApiUser } from "@/lib/auth";
import { transcribe } from "@/lib/transcribe";

export const maxDuration = 60;

/** "Tell us what's wrong": one voice recording (form field `audio`) → its text. */
export const POST = route(async (req) => {
  await requireApiUser("customer");
  const audio = (await req.formData()).get("audio");
  if (!(audio instanceof File)) throw new HttpError(400, "No recording received.");
  return { text: await transcribe(audio) };
});
