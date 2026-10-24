/** Must match an "Authorized redirect URI" on the Google OAuth client, e.g. http://localhost:3000/pro/google/callback. */
export const redirectUri = (req: Request) => `${new URL(req.url).origin}/pro/google/callback`;
