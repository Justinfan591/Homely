import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { route } from "@/lib/api";
import { HttpError, createToken, sessionUser } from "@/lib/auth";

const body = z.object({ email: z.string().trim().toLowerCase(), password: z.string() });

export const POST = route(async (req) => {
  const { email, password } = body.parse(await req.json());
  const user = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, "Wrong email or password.");
  }
  return { token: await createToken(user.id), user: sessionUser(user) };
});
