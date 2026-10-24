import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { route } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { getProfile } from "@/lib/jobs";
import { TRADES } from "@/shared/types";

export const GET = route(async () => {
  const user = await requireApiUser("provider");
  return { profile: getProfile(user.id), phone: user.phone };
});

const body = z.object({
  businessName: z.string().trim().max(100).optional(),
  trades: z.array(z.enum(TRADES)).min(1, "Pick at least one trade."),
  zips: z
    .array(z.string().regex(/^\d{5}$/, "ZIP codes must be 5 digits."))
    .min(1, "Add at least one ZIP code.")
    .max(50),
  bio: z.string().trim().max(1000).optional(),
  phone: z.string().trim().max(30).optional(),
  active: z.boolean(),
});

export const PUT = route(async (req) => {
  const user = await requireApiUser("provider");
  const data = body.parse(await req.json());
  db.update(schema.providerProfiles)
    .set({
      businessName: data.businessName || null,
      trades: data.trades,
      zips: [...new Set(data.zips)],
      bio: data.bio || null,
      active: data.active,
    })
    .where(eq(schema.providerProfiles.userId, user.id))
    .run();
  db.update(schema.users).set({ phone: data.phone || null }).where(eq(schema.users.id, user.id)).run();
  return { ok: true };
});
