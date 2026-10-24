import { route } from "@/lib/api";

// Tokens are stateless: the app signs out by deleting its stored token.
export const POST = route(async () => ({ ok: true }));
