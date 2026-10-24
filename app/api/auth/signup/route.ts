import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { route } from "@/lib/api";
import { HttpError, createToken, sessionUser } from "@/lib/auth";

const body = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  phone: z.string().trim().max(30).optional(),
  // Staff (agent) accounts are created by an admin, not via public signup.
  role: z.enum(["customer", "provider"]),
});

export const POST = route(async (req) => {
  const data = body.parse(await req.json());
  if (db.select().from(schema.users).where(eq(schema.users.email, data.email)).get()) {
    throw new HttpError(409, "An account with that email already exists.");
  }
  const user = db
    .insert(schema.users)
    .values({
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      role: data.role,
      passwordHash: await bcrypt.hash(data.password, 10),
    })
    .returning()
    .get();
  if (user.role === "provider") {
    db.insert(schema.providerProfiles).values({ userId: user.id, trades: [], zips: [] }).run();
  }
  return { token: await createToken(user.id), user: sessionUser(user) };
});
