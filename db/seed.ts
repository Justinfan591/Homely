// Creates demo accounts. Safe to run more than once.
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "./index";

const PASSWORD = "password123";

const people = [
  { role: "customer", name: "Casey Homeowner", email: "customer@demo.com", phone: "555-0100" },
  { role: "agent", name: "Alex Support", email: "agent@demo.com", phone: "555-0199" },
  {
    role: "provider",
    name: "Pat Rivera",
    email: "plumber@demo.com",
    phone: "555-0111",
    profile: { businessName: "Rivera Plumbing", trades: ["plumbing", "handyman"], zips: ["94110", "94103", "94114"], bio: "Licensed plumber, 12 years in the Mission." },
  },
  {
    role: "provider",
    name: "Erin Watts",
    email: "electrician@demo.com",
    phone: "555-0122",
    profile: { businessName: "Watts Electric", trades: ["electrical"], zips: ["94110", "94103"], bio: "Residential electrician. Panels, outlets, lighting." },
  },
  {
    role: "provider",
    name: "Hank Cole",
    email: "hvac@demo.com",
    phone: "555-0133",
    profile: { businessName: "Cole Heating & Air", trades: ["hvac", "appliance"], zips: ["10001", "10011"], bio: "HVAC and appliance repair in Manhattan." },
  },
] as const;

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  for (const p of people) {
    let user = db.select().from(schema.users).where(eq(schema.users.email, p.email)).get();
    if (!user) {
      user = db
        .insert(schema.users)
        .values({ role: p.role, name: p.name, email: p.email, phone: p.phone, passwordHash })
        .returning()
        .get();
    }
    if ("profile" in p && !db.select().from(schema.providerProfiles).where(eq(schema.providerProfiles.userId, user.id)).get()) {
      db.insert(schema.providerProfiles)
        .values({ userId: user.id, ...p.profile, trades: [...p.profile.trades], zips: [...p.profile.zips], ratingAvg: 4.8, jobsDone: 23 })
        .run();
    }
    console.log(`${p.role.padEnd(9)} ${p.email}`);
  }
  console.log(`\nAll demo accounts use the password: ${PASSWORD}`);
}

main();
