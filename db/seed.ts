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
  seedScope();
  console.log(`\nAll demo accounts use the password: ${PASSWORD}`);
}

// ---------- Scope providers + demo home ----------
// Everything is placed around DEMO_LAT/DEMO_LNG (default: downtown Montreal).
// Run `npm run db:seed` again with new values to move the demo to the venue.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: use the defaults.
}
const CENTER = { lat: Number(process.env.DEMO_LAT) || 45.5019, lng: Number(process.env.DEMO_LNG) || -73.5674 };
const at = (dLat: number, dLng: number) => ({ lat: CENTER.lat + dLat, lng: CENTER.lng + dLng });

const scopeProviders = [
  { name: "Mold Busters", trades: ["mold"], ...at(0.05, -0.03), radiusKm: 50, rating: 4.9, ratingCount: 212, phone: "555-0150", offersVirtual: true, rateCard: { base: 150, per_m2: 40, severity_multiplier: [1, 1, 1.2, 1.5, 2] }, description: "Full-service mold remediation company. Large and severe jobs: whole basements, attics, crawl spaces and water-damaged drywall, with containment and air scrubbers. Also runs virtual assessments." },
  { name: "ClearSpore Remediation", trades: ["mold"], ...at(-0.02, 0.02), radiusKm: 15, rating: 4.6, ratingCount: 48, phone: "555-0151", offersVirtual: false, rateCard: { base: 120, per_m2: 35, severity_multiplier: [1, 1.1, 1.3, 1.6, 2.1] }, description: "Small downtown team focused on bathrooms and kitchens: shower and ceiling mold, window sills, caulking and ventilation fixes. Best for light to moderate jobs." },
  // Out of range on purpose: shows the distance filter.
  { name: "Northshore Mold Co", trades: ["mold"], ...at(2.5, 0), radiusKm: 40, rating: 4.8, ratingCount: 90, phone: "555-0152", offersVirtual: false, rateCard: { base: 140, per_m2: 38, severity_multiplier: [1, 1, 1.2, 1.5, 2] }, description: "Mold inspection and remediation for North Shore homes and cottages, including crawl spaces and seasonal properties." },
  { name: "Clearwater Plumbing", trades: ["plumbing_sink"], ...at(0.03, 0.04), radiusKm: 25, rating: 4.8, ratingCount: 133, phone: "555-0160", offersVirtual: true, rateCard: { base: 120, per_m2: 15, severity_multiplier: [1, 1.1, 1.3, 1.6, 2] }, description: "Residential plumbers for kitchens and bathrooms: leaking faucets, sink drains, P-traps, garbage disposals and under-sink water damage. Same-day emergency leaks." },
  { name: "Pipeline Pros", trades: ["plumbing_sink"], ...at(-0.06, -0.05), radiusKm: 20, rating: 4.5, ratingCount: 61, phone: "555-0161", offersVirtual: false, rateCard: { base: 95, per_m2: 10, severity_multiplier: [1, 1.15, 1.35, 1.7, 2.2] }, description: "Drain and pipe specialists: clogged and slow drains, drain cleaning, pipe replacement and re-piping. Not focused on fixtures." },
  // An individual, not a company: shows solo pros can sign up too.
  // Out of the demo home's range so the e2e match lists stay the same.
  // Two pros for each of the newer trades, so the app's Quotes screen has offers to compare.
  { name: "Bright Spark Electric", trades: ["electrical"], ...at(0.02, -0.02), radiusKm: 25, rating: 4.9, ratingCount: 156, phone: "555-0180", offersVirtual: true, rateCard: { base: 110, per_m2: 0, severity_multiplier: [1, 1.2, 1.5, 1.9, 2.5] }, description: "Licensed residential electricians: dead outlets, switches, light fixtures, tripping breakers and panel checks. Same-day safety calls." },
  { name: "Volt & Co", trades: ["electrical"], ...at(-0.03, 0.04), radiusKm: 20, rating: 4.6, ratingCount: 58, phone: "555-0181", offersVirtual: false, rateCard: { base: 90, per_m2: 0, severity_multiplier: [1, 1.2, 1.5, 2, 2.6] }, description: "Small electrical repairs and installs: outlets, dimmers, ceiling fans and lighting." },
  { name: "Fix-It Fred", trades: ["handyman"], ...at(0.01, 0.03), radiusKm: 20, rating: 4.8, ratingCount: 201, phone: "555-0182", offersVirtual: false, rateCard: { base: 70, per_m2: 20, severity_multiplier: [1, 1.2, 1.6, 2.2, 3] }, description: "Handyman for small jobs: doors, cabinets, shelves, TV mounting, furniture assembly and drywall patches." },
  { name: "Odd Jobs Collective", trades: ["handyman", "painting"], ...at(-0.04, -0.02), radiusKm: 25, rating: 4.5, ratingCount: 77, phone: "555-0183", offersVirtual: false, rateCard: { base: 60, per_m2: 18, severity_multiplier: [1, 1.2, 1.5, 2, 2.6] }, description: "A team of handypeople and painters. Good for a list of small fixes, touch-ups and one-room repaints." },
  { name: "KeyPoint Locksmiths", trades: ["locksmith"], ...at(0.03, -0.01), radiusKm: 30, rating: 4.9, ratingCount: 310, phone: "555-0184", offersVirtual: false, rateCard: { base: 95, per_m2: 0, severity_multiplier: [1, 1.1, 1.4, 1.7, 2] }, description: "24/7 lockouts, rekeying, lock changes and smart locks." },
  { name: "Secure Home Locks", trades: ["locksmith"], ...at(-0.02, 0.05), radiusKm: 20, rating: 4.6, ratingCount: 64, phone: "555-0185", offersVirtual: false, rateCard: { base: 80, per_m2: 0, severity_multiplier: [1, 1.1, 1.4, 1.8, 2.2] }, description: "Residential locks: deadbolts, rekeying and new keys. Daytime appointments." },
  { name: "Fresh Coat Painters", trades: ["painting"], ...at(0.04, 0.02), radiusKm: 25, rating: 4.8, ratingCount: 122, phone: "555-0186", offersVirtual: true, rateCard: { base: 150, per_m2: 12, severity_multiplier: [1, 1, 1.2, 1.5, 1.9] }, description: "Interior and exterior painting: rooms, trim, ceilings, cabinets. Includes prep and repairs." },
  { name: "Greenleaf Gardens", trades: ["garden"], ...at(0.06, 0.01), radiusKm: 30, rating: 4.7, ratingCount: 95, phone: "555-0187", offersVirtual: false, rateCard: { base: 60, per_m2: 1.5, severity_multiplier: [1, 1.1, 1.4, 1.9, 2.6] }, description: "Lawn care, hedges, weeding, seasonal clean-ups and small tree work." },
  { name: "Yard Pros", trades: ["garden"], ...at(-0.05, 0.03), radiusKm: 25, rating: 4.5, ratingCount: 40, phone: "555-0188", offersVirtual: false, rateCard: { base: 50, per_m2: 1.2, severity_multiplier: [1, 1.1, 1.5, 2, 2.8] }, description: "Weekly mowing and yard clean-up. Not tree removal." },
  { name: "ApplianceDoc", trades: ["appliances"], ...at(0.02, 0.05), radiusKm: 30, rating: 4.8, ratingCount: 188, phone: "555-0189", offersVirtual: true, rateCard: { base: 100, per_m2: 10, severity_multiplier: [1, 1.1, 1.4, 1.7, 2.2] }, description: "Repairs for fridges, washers, dryers, dishwashers and ovens. Most major brands." },
  { name: "QuickFix Appliance", trades: ["appliances"], ...at(-0.01, -0.04), radiusKm: 20, rating: 4.4, ratingCount: 52, phone: "555-0190", offersVirtual: false, rateCard: { base: 85, per_m2: 10, severity_multiplier: [1, 1.15, 1.45, 1.8, 2.3] }, description: "Washer, dryer and dishwasher repair. Evening slots." },
  { name: "Justin Fan", trades: ["mold", "plumbing_sink"], ...at(-1.5, 0.5), radiusKm: 20, rating: 5, ratingCount: 7, phone: "555-0170", offersVirtual: false, rateCard: { base: 90, per_m2: 30, severity_multiplier: [1, 1.1, 1.3, 1.6, 2] }, description: "Independent handyman-plumber and mold tech. Small, quick jobs: drippy faucets, sink leaks and small patches of bathroom mold. Flexible evening visits." },
];

function seedScope() {
  console.log("");
  for (const p of scopeProviders) {
    const existing = db.select().from(schema.providers).where(eq(schema.providers.name, p.name)).get();
    if (existing) {
      // Only move it (and fill in a missing description); keep rate card, rating and profile changes made in /pro.
      db.update(schema.providers).set({ lat: p.lat, lng: p.lng, radiusKm: p.radiusKm, description: existing.description ?? p.description }).where(eq(schema.providers.id, existing.id)).run();
    } else {
      db.insert(schema.providers).values(p).run();
    }
    const row = db.select().from(schema.providers).where(eq(schema.providers.name, p.name)).get()!;
    console.log(`provider  #${row.id} ${p.name} (${p.trades.join(", ")})  /pro?provider=${row.id}`);
  }
  const customer = db.select().from(schema.users).where(eq(schema.users.email, "customer@demo.com")).get();
  if (customer) {
    const values = { label: "Demo house", address: "Demo house", lat: CENTER.lat, lng: CENTER.lng };
    const home = db.select().from(schema.homes).where(eq(schema.homes.customerId, customer.id)).get();
    if (home) db.update(schema.homes).set(values).where(eq(schema.homes.id, home.id)).run();
    else db.insert(schema.homes).values({ customerId: customer.id, ...values }).run();
    console.log(`home      Demo house for customer@demo.com at ${CENTER.lat}, ${CENTER.lng}`);
  }
}

main();
