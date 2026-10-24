import "server-only";
import { HttpError } from "@/lib/auth";
import { fakeAi } from "@/lib/scope/ai";

const MODEL = "gpt-4o-mini-transcribe";
const MAX_BYTES = 25 * 1024 * 1024; // OpenAI's upload limit
const AUDIO_EXT = /\.(m4a|mp4|mp3|mpeg|mpga|wav|webm|ogg|aac|caf)$/i;

export const FAKE_TRANSCRIPT = "There's a leak under my kitchen sink. It drips whenever the tap is on.";

/** Speech → text with OpenAI (OPENAI_API_KEY). SCOPE_FAKE_AI=1 returns a fixed sentence. */
export async function transcribe(audio: File): Promise<string> {
  if (audio.size === 0) throw new HttpError(400, "We didn't hear anything. Try again.");
  if (audio.size > MAX_BYTES) throw new HttpError(400, "That recording is too long. Keep it under a few minutes.");
  if (fakeAi()) return FAKE_TRANSCRIPT;

  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new HttpError(503, "Voice isn't configured yet (missing OPENAI_API_KEY). Pick the problem instead.");

  // OpenAI picks the decoder from the file extension.
  const name = AUDIO_EXT.test(audio.name) ? audio.name : "recording.m4a";
  const form = new FormData();
  form.set("model", MODEL);
  form.set("file", new File([await audio.arrayBuffer()], name, { type: audio.type || "audio/mp4" }));
  form.set("prompt", "A homeowner describing a problem in their home: leaks, mold, electrical, locks, painting, garden, appliances.");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    console.error("Transcription request failed", err);
    throw new HttpError(502, "We couldn't transcribe that. Please try again.");
  }
  if (res.status === 429) throw new HttpError(503, "Voice is busy. Please try again in a minute.");
  if (!res.ok) {
    console.error("Transcription error", res.status, await res.text().catch(() => ""));
    throw new HttpError(502, "We couldn't transcribe that. Please try again.");
  }
  const text = String(((await res.json()) as { text?: string }).text ?? "").trim();
  if (!text) throw new HttpError(422, "We didn't catch that. Try again, a bit closer to the phone.");
  return text;
}
