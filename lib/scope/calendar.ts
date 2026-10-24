// Google Calendar for /pro (SOON26 §7 "Connects with google calendar"): OAuth connect, then accepted
// jobs become events in the pro's primary calendar. Plain fetch against Google's REST endpoints.
// No "server-only" import and an injectable fetch so scripts/calendar.test.ts can run it in Node.
import crypto from "node:crypto";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

type Fetch = typeof fetch;
export type GoogleConfig = { clientId: string; clientSecret: string };

/** Null until GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set (see README). */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

// ---------- OAuth state: which provider is connecting, signed so the callback can't be forged ----------

const STATE_TTL_S = 15 * 60;

function hmac(data: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters (see .env.example).");
  return crypto.createHmac("sha256", secret).update(`google-state:${data}`).digest("base64url");
}

export function signState(providerId: number, now = Date.now()) {
  const data = `${providerId}.${Math.floor(now / 1000) + STATE_TTL_S}`;
  return `${data}.${hmac(data)}`;
}

/** The provider id, or null if the state is tampered with or expired. */
export function verifyState(state: string | null, now = Date.now()): number | null {
  const [id, exp, sig] = (state ?? "").split(".");
  if (!id || !exp || !sig) return null;
  const want = Buffer.from(hmac(`${id}.${exp}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  if (Number(exp) * 1000 < now) return null;
  return Number(id);
}

export function authUrl(cfg: GoogleConfig, redirectUri: string, state: string) {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline", // a refresh token, so events can be added later without the pro present
    prompt: "consent", // Google only returns the refresh token on consent
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${q}`;
}

// ---------- Google calls ----------

async function google<T>(f: Fetch, url: string, init: RequestInit): Promise<T> {
  const res = await f(url, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = data.error_description ?? data.error?.message ?? data.error ?? `HTTP ${res.status}`;
    throw new Error(`Google: ${msg}`);
  }
  return data as T;
}

const form = (body: Record<string, string>): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(body).toString(),
});

/** OAuth callback: code → refresh token, plus the calendar's id (the account's email) to show on /pro. */
export async function connect(cfg: GoogleConfig, code: string, redirectUri: string, f: Fetch = fetch) {
  const t = await google<{ access_token: string; refresh_token?: string }>(
    f,
    TOKEN_URL,
    form({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  );
  if (!t.refresh_token) throw new Error("Google didn't return a refresh token. Remove Scope's access in your Google account and connect again.");
  const cal = await google<{ id: string }>(f, `${API}/calendars/primary`, { headers: { Authorization: `Bearer ${t.access_token}` } });
  return { refreshToken: t.refresh_token, calendar: cal.id };
}

async function accessToken(cfg: GoogleConfig, refreshToken: string, f: Fetch) {
  const t = await google<{ access_token: string }>(
    f,
    TOKEN_URL,
    form({ refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" }),
  );
  return t.access_token;
}

export type CalendarEvent = { summary: string; description: string; location: string; start: Date; minutes: number };

/** Creates the event in the pro's primary calendar and returns its link. */
export async function addEvent(cfg: GoogleConfig, refreshToken: string, ev: CalendarEvent, f: Fetch = fetch) {
  const token = await accessToken(cfg, refreshToken, f);
  const end = new Date(ev.start.getTime() + ev.minutes * 60 * 1000);
  const created = await google<{ id: string; htmlLink: string }>(f, `${API}/calendars/primary/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: ev.summary,
      description: ev.description,
      location: ev.location,
      start: { dateTime: ev.start.toISOString() },
      end: { dateTime: end.toISOString() },
    }),
  });
  return created.htmlLink;
}

/** Disconnect: best effort, the token is forgotten either way. */
export async function revoke(refreshToken: string, f: Fetch = fetch) {
  await f(REVOKE_URL, form({ token: refreshToken })).catch(() => {});
}
