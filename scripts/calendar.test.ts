// Run: npx tsx scripts/calendar.test.ts — checks lib/scope/calendar.ts against a fake Google.
import assert from "node:assert/strict";
import { addEvent, authUrl, connect, signState, verifyState } from "../lib/scope/calendar";

process.env.SESSION_SECRET ??= "x".repeat(32);
const cfg = { clientId: "cid", clientSecret: "secret" };
const redirect = "http://localhost:3000/pro/google/callback";

// State: round-trips, rejects tampering and expiry.
const state = signState(7);
assert.equal(verifyState(state), 7);
assert.equal(verifyState(state.replace(/^7\./, "8.")), null, "provider id can't be swapped");
assert.equal(verifyState(state, Date.now() + 16 * 60 * 1000), null, "expires after 15 min");
assert.equal(verifyState(null), null);

const url = new URL(authUrl(cfg, redirect, state));
assert.equal(url.searchParams.get("redirect_uri"), redirect);
assert.equal(url.searchParams.get("access_type"), "offline");
assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/calendar.events");

// A fake Google that records what it was sent.
const calls: { url: string; init?: RequestInit }[] = [];
const google = (routes: Record<string, unknown>, status = 200) =>
  (async (u: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(u), init });
    const body = Object.entries(routes).find(([k]) => String(u).startsWith(k))?.[1] ?? {};
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;

const ok = google({
  "https://oauth2.googleapis.com/token": { access_token: "at", refresh_token: "rt" },
  "https://www.googleapis.com/calendar/v3/calendars/primary/events": { id: "e1", htmlLink: "https://calendar.google.com/e1" },
  "https://www.googleapis.com/calendar/v3/calendars/primary": { id: "pro@example.com" },
});

async function main() {
  const c = await connect(cfg, "code123", redirect, ok);
  assert.deepEqual(c, { refreshToken: "rt", calendar: "pro@example.com" });
  const tokenForm = new URLSearchParams(String(calls[0].init?.body));
  assert.deepEqual([tokenForm.get("grant_type"), tokenForm.get("code"), tokenForm.get("redirect_uri")], ["authorization_code", "code123", redirect]);

  calls.length = 0;
  const start = new Date("2026-10-25T13:00:00Z");
  const link = await addEvent(cfg, "rt", { summary: "Visit: Damp spot", description: "Job #1", location: "1 Test St", start, minutes: 120 }, ok);
  assert.equal(link, "https://calendar.google.com/e1");
  assert.equal(new URLSearchParams(String(calls[0].init?.body)).get("grant_type"), "refresh_token");
  const ev = JSON.parse(String(calls[1].init?.body));
  assert.deepEqual([ev.start.dateTime, ev.end.dateTime, ev.location], ["2026-10-25T13:00:00.000Z", "2026-10-25T15:00:00.000Z", "1 Test St"]);
  assert.equal((calls[1].init?.headers as Record<string, string>).Authorization, "Bearer at");

  // Google errors surface with Google's message; a missing refresh token is explained.
  await assert.rejects(addEvent(cfg, "bad", { summary: "", description: "", location: "", start, minutes: 30 }, google({ "https://oauth2.googleapis.com/token": { error: "invalid_grant", error_description: "Token has been expired or revoked." } }, 400)), /Token has been expired or revoked/);
  await assert.rejects(connect(cfg, "c", redirect, google({ "https://oauth2.googleapis.com/token": { access_token: "at" } })), /refresh token/);

  console.log("calendar ok");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
