import { NextResponse } from "next/server";
import { connect, googleConfig, verifyState } from "@/lib/scope/calendar";
import { providerById, saveGoogle } from "@/lib/scope/pro";
import { proHref } from "../../href";
import { redirectUri } from "../redirect";

/** Google sends the pro back here with a code (or an error if they said no). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const id = verifyState(q.get("state"));
  const back = (opts: Parameters<typeof proHref>[1]) => NextResponse.redirect(new URL(id ? proHref(id, opts) : "/pro", req.url));
  const cfg = googleConfig();
  if (!id || !cfg) return back({ error: "That Google sign-in link expired. Try Connect Google Calendar again." });
  if (q.get("error") || !q.get("code")) return back({ error: `Google Calendar wasn't connected (${q.get("error") ?? "no code"}).` });
  try {
    const p = providerById(id);
    saveGoogle(p, await connect(cfg, q.get("code")!, redirectUri(req)));
    return back({ notice: "Google Calendar connected. Jobs you accept now go straight into it." });
  } catch (err) {
    return back({ error: err instanceof Error ? err.message : "Couldn't connect Google Calendar." });
  }
}
