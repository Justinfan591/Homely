import "server-only";
import { sealData, unsealData } from "iron-session";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";

export type Role = User["role"];
type TokenData = { userId?: number };

const TOKEN_TTL = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters (see .env.example).");
  }
  return password;
}

/** Creates the bearer token the mobile app stores after login or signup. */
export function createToken(userId: number) {
  return sealData({ userId } satisfies TokenData, { password: secret(), ttl: TOKEN_TTL });
}

export async function getCurrentUser(): Promise<User | null> {
  const auth = (await headers()).get("authorization");
  const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { userId } = await unsealData<TokenData>(token, { password: secret(), ttl: TOKEN_TTL }).catch(() => ({}) as TokenData);
  if (!userId) return null;
  const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  return user ?? null;
}

/** The user fields the app is allowed to see about the signed-in user. */
export function sessionUser(user: User) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** For API routes: throw a 401/403 HttpError if not allowed. */
export async function requireApiUser(...roles: Role[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Please sign in.");
  if (roles.length && !roles.includes(user.role)) throw new HttpError(403, "Not allowed.");
  return user;
}
