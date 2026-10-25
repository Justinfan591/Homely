import { NextResponse, type NextRequest } from "next/server";

// CORS for /api/*, so a UI served from another origin (Vite, Expo web, a tunnel)
// can call this server. Auth is a bearer token, never cookies, so any origin is fine.
// Set CORS_ORIGINS="https://a.example,https://b.example" to restrict it (empty or unset: any origin).
const allowed = (process.env.CORS_ORIGINS || "*").split(",").map((s) => s.trim()).filter(Boolean);

function corsHeaders(origin: string | null) {
  const allowOrigin = allowed.includes("*") ? "*" : origin && allowed.includes(origin) ? origin : "";
  const h = new Headers();
  if (!allowOrigin) return h;
  h.set("Access-Control-Allow-Origin", allowOrigin);
  h.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  h.set("Access-Control-Max-Age", "86400");
  if (allowOrigin !== "*") h.set("Vary", "Origin");
  return h;
}

export function middleware(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new NextResponse(null, { status: 204, headers });
  const res = NextResponse.next();
  headers.forEach((v, k) => res.headers.set(k, v));
  return res;
}

export const config = { matcher: "/api/:path*" };
