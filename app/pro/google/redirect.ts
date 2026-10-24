/**
 * The address the browser used, from the Host header. Not req.url: with `next dev -H 0.0.0.0` that says
 * 0.0.0.0, which Google rejects as a redirect ("doesn't comply with Google's OAuth 2.0 policy").
 */
export function origin(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** Must match an "Authorized redirect URI" on the Google OAuth client. Google only allows plain http for localhost. */
export const redirectUri = (req: Request) => `${origin(req)}/pro/google/callback`;
