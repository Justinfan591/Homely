import { NextResponse } from "next/server";
import { authUrl, googleConfig, signState } from "@/lib/scope/calendar";
import { providerById } from "@/lib/scope/pro";
import { proHref } from "../../href";
import { origin, redirectUri } from "../redirect";

/** "Connect Google Calendar" on /pro: off to Google's consent screen. */
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("provider"));
  const cfg = googleConfig();
  if (!cfg) return NextResponse.redirect(new URL(proHref(id, { error: "Google Calendar isn't set up yet: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local (see README)." }), origin(req)));
  try {
    return NextResponse.redirect(authUrl(cfg, redirectUri(req), signState(providerById(id).id)));
  } catch {
    return NextResponse.redirect(new URL("/pro", origin(req))); // unknown provider: back to the picker
  }
}
