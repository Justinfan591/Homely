import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { route } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { geocode } from "@/lib/geocode";
import { homeOf, saveHome } from "@/lib/scope/service";
import { HOME_TYPES, type ProfileInfo } from "@/shared/scope";

function profile(user: User): ProfileInfo {
  const home = homeOf(user);
  return {
    name: user.name,
    email: user.email.endsWith("@phone.scope.local") ? null : user.email,
    phone: user.phone,
    age: user.age ?? null,
    address: home?.address ?? null,
    homeType: home?.homeType ?? null,
  };
}

/** The homeowner's own details (Profile tab). */
export const GET = route(async () => profile(await requireApiUser("customer")));

const body = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80).optional(),
  age: z.number().int().min(13).max(120).nullable().optional(),
  address: z.string().trim().min(1, "Enter your address.").max(200).optional(),
  homeType: z.enum(HOME_TYPES).nullable().optional(),
});

/** Sign-up (name, then home) and Profile · edit. Only the fields sent are changed. */
export const PUT = route(async (req) => {
  const user = await requireApiUser("customer");
  const input = body.parse(await req.json());
  const set: Partial<User> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.age !== undefined) set.age = input.age;
  if (Object.keys(set).length) db.update(schema.users).set(set).where(eq(schema.users.id, user.id)).run();

  const home = homeOf(user);
  if (input.address !== undefined && input.address !== home?.address) {
    const at = await geocode(input.address);
    saveHome(user, { address: input.address, lat: at.lat, lng: at.lng, homeType: input.homeType });
  } else if (input.homeType !== undefined && home) {
    saveHome(user, { address: home.address, lat: home.lat, lng: home.lng, homeType: input.homeType });
  }
  return profile(db.select().from(schema.users).where(eq(schema.users.id, user.id)).get()!);
});
