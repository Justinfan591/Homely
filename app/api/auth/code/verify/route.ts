import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { route } from "@/lib/api";
import { HttpError, createToken } from "@/lib/auth";
import { loginCode, parseContact, phoneEmail } from "@/lib/contact";
import { homeOf } from "@/lib/scope/service";
import type { CodeLoginResponse } from "@/shared/scope";

const body = z.object({ contact: z.string().max(200), code: z.string().max(20) });

/** Step 2 of sign-in: checks the code, then signs in, creating a homeowner account the first time. */
export const POST = route(async (req): Promise<CodeLoginResponse> => {
  const input = body.parse(await req.json());
  const contact = parseContact(input.contact);
  if (input.code.replace(/\D/g, "") !== loginCode()) throw new HttpError(401, "That code isn't right. Try again.");

  const { users } = schema;
  const email = contact.kind === "email" ? contact.email : phoneEmail(contact.phone);
  let user =
    db.select().from(users).where(eq(users.email, email)).get() ??
    (contact.kind === "phone" ? db.select().from(users).where(eq(users.phone, contact.phone)).get() : undefined);

  if (user && user.role !== "customer") throw new HttpError(403, "This app is for homeowners. Pros use the /pro dashboard.");
  if (!user) {
    user = db
      .insert(users)
      .values({
        role: "customer",
        name: "",
        email,
        phone: contact.kind === "phone" ? contact.phone : null,
        // Code sign-in only; nobody knows this password.
        passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10),
      })
      .returning()
      .get();
  }
  // "New" until they've told us their name and home, so an interrupted sign-up resumes there.
  return { token: await createToken(user.id), isNew: !user.name.trim() || !homeOf(user) };
});
