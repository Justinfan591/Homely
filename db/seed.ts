// Creates demo accounts. Safe to run more than once.
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "./index";
import { runMigrations } from "./migrations";
import type { ProviderPricing } from "../shared/scope";

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
  { name: "Mold Busters", trades: ["mold"], ...at(0.05, -0.03), radiusKm: 50, rating: 4.9, ratingCount: 212, phone: "555-0150", offersVirtual: true, rateCard: { callOut: 150, hourly: 110, partsMarkupPct: 15, approveOver: 1200 }, description: "Full-service mold remediation company. Large and severe jobs: whole basements, attics, crawl spaces and water-damaged drywall, with containment and air scrubbers. Also runs virtual assessments." },
  { live: true, name: "ClearSpore Remediation", trades: ["mold"], ...at(-0.02, 0.02), radiusKm: 15, rating: 4.6, ratingCount: 48, phone: "555-0151", offersVirtual: false, rateCard: { callOut: 120, hourly: 90, partsMarkupPct: 15, approveOver: 1200 }, description: "Small downtown team focused on bathrooms and kitchens: shower and ceiling mold, window sills, caulking and ventilation fixes. Best for light to moderate jobs." },
  // Out of range on purpose: shows the distance filter.
  { name: "Northshore Mold Co", trades: ["mold"], ...at(2.5, 0), radiusKm: 40, rating: 4.8, ratingCount: 90, phone: "555-0152", offersVirtual: false, rateCard: { callOut: 140, hourly: 105, partsMarkupPct: 15, approveOver: 1200 }, description: "Mold inspection and remediation for North Shore homes and cottages, including crawl spaces and seasonal properties." },
  { name: "Clearwater Plumbing", trades: ["plumbing_sink"], ...at(0.03, 0.04), radiusKm: 25, rating: 4.8, ratingCount: 133, phone: "555-0160", offersVirtual: true, rateCard: { callOut: 120, hourly: 90, partsMarkupPct: 15, approveOver: 600 }, description: "Residential plumbers for kitchens and bathrooms: leaking faucets, sink drains, P-traps, garbage disposals and under-sink water damage. Same-day emergency leaks." },
  { live: true, name: "Pipeline Pros", trades: ["plumbing_sink"], ...at(-0.06, -0.05), radiusKm: 20, rating: 4.5, ratingCount: 61, phone: "555-0161", offersVirtual: false, rateCard: { callOut: 95, hourly: 70, partsMarkupPct: 15, approveOver: 600 }, description: "Drain and pipe specialists: clogged and slow drains, drain cleaning, pipe replacement and re-piping. Not focused on fixtures." },
  // An individual, not a company: shows solo pros can sign up too.
  // Out of the demo home's range so the e2e match lists stay the same.
  // Two pros for each of the newer trades, so the app's Quotes screen has offers to compare.
  { name: "Bright Spark Electric", trades: ["electrical"], ...at(0.02, -0.02), radiusKm: 25, rating: 4.9, ratingCount: 156, phone: "555-0180", offersVirtual: true, rateCard: { callOut: 110, hourly: 80, partsMarkupPct: 15, approveOver: 600 }, description: "Licensed residential electricians: dead outlets, switches, light fixtures, tripping breakers and panel checks. Same-day safety calls." },
  { live: true, name: "Volt & Co", trades: ["electrical"], ...at(-0.03, 0.04), radiusKm: 20, rating: 4.6, ratingCount: 58, phone: "555-0181", offersVirtual: false, rateCard: { callOut: 90, hourly: 70, partsMarkupPct: 15, approveOver: 600 }, description: "Small electrical repairs and installs: outlets, dimmers, ceiling fans and lighting." },
  { name: "Fix-It Fred", trades: ["handyman"], ...at(0.01, 0.03), radiusKm: 20, rating: 4.8, ratingCount: 201, phone: "555-0182", offersVirtual: false, rateCard: { callOut: 70, hourly: 50, partsMarkupPct: 15, approveOver: 600 }, description: "Handyman for small jobs: doors, cabinets, shelves, TV mounting, furniture assembly and drywall patches." },
  { live: true, name: "Odd Jobs Collective", trades: ["handyman", "painting"], ...at(-0.04, -0.02), radiusKm: 25, rating: 4.5, ratingCount: 77, phone: "555-0183", offersVirtual: false, rateCard: { callOut: 60, hourly: 45, partsMarkupPct: 15, approveOver: 1200 }, description: "A team of handypeople and painters. Good for a list of small fixes, touch-ups and one-room repaints." },
  { name: "Northline Roofing", trades: ["roofing"], ...at(0.03, -0.01), radiusKm: 35, rating: 4.9, ratingCount: 214, phone: "555-0184", offersVirtual: true, rateCard: { callOut: 180, hourly: 135, partsMarkupPct: 15, approveOver: 1200 }, description: "Residential roofers: leak repairs, missing and damaged shingles, flat roofs and full re-roofs. Emergency tarping after storms." },
  { live: true, name: "Summit Roof & Gutter", trades: ["roofing"], ...at(-0.02, 0.05), radiusKm: 25, rating: 4.6, ratingCount: 71, phone: "555-0185", offersVirtual: false, rateCard: { callOut: 150, hourly: 110, partsMarkupPct: 15, approveOver: 1200 }, description: "Small roof repairs and gutters: shingle patches, flashing around chimneys, gutter cleaning, repairs and downspouts. No full re-roofs." },
  { name: "Fresh Coat Painters", trades: ["painting"], ...at(0.04, 0.02), radiusKm: 25, rating: 4.8, ratingCount: 122, phone: "555-0186", offersVirtual: true, rateCard: { callOut: 150, hourly: 110, partsMarkupPct: 15, approveOver: 1200 }, description: "Interior and exterior painting: rooms, trim, ceilings, cabinets. Includes prep and repairs." },
  { name: "Greenleaf Gardens", trades: ["garden"], ...at(0.06, 0.01), radiusKm: 30, rating: 4.7, ratingCount: 95, phone: "555-0187", offersVirtual: false, rateCard: { callOut: 60, hourly: 45, partsMarkupPct: 15, approveOver: 600 }, description: "Lawn care, hedges, weeding, seasonal clean-ups and small tree work." },
  { live: true, name: "Yard Pros", trades: ["garden"], ...at(-0.05, 0.03), radiusKm: 25, rating: 4.5, ratingCount: 40, phone: "555-0188", offersVirtual: false, rateCard: { callOut: 50, hourly: 40, partsMarkupPct: 15, approveOver: 600 }, description: "Weekly mowing and yard clean-up. Not tree removal." },
  { name: "ApplianceDoc", trades: ["appliances"], ...at(0.02, 0.05), radiusKm: 30, rating: 4.8, ratingCount: 188, phone: "555-0189", offersVirtual: true, rateCard: { callOut: 100, hourly: 75, partsMarkupPct: 15, approveOver: 600 }, description: "Repairs for fridges, washers, dryers, dishwashers and ovens. Most major brands." },
  { live: true, name: "QuickFix Appliance", trades: ["appliances"], ...at(-0.01, -0.04), radiusKm: 20, rating: 4.4, ratingCount: 52, phone: "555-0190", offersVirtual: false, rateCard: { callOut: 85, hourly: 65, partsMarkupPct: 15, approveOver: 600 }, description: "Washer, dryer and dishwasher repair. Evening slots." },
  { live: true, name: "Justin Fan", trades: ["mold", "plumbing_sink"], ...at(-1.5, 0.5), radiusKm: 20, rating: 5, ratingCount: 7, phone: "555-0170", offersVirtual: false, rateCard: { callOut: 90, hourly: 70, partsMarkupPct: 15, approveOver: 1200 }, description: "Independent handyman-plumber and mold tech. Small, quick jobs: drippy faucets, sink leaks and small patches of bathroom mold. Flexible evening visits." },
];

function seedScope() {
  console.log("");
  runMigrations(); // first, so the old locksmiths become the roofers before upserting by name
  for (const entry of scopeProviders) {
    const { live, ...p } = { live: false, ...entry };
    // `live`: this pro's pricing agent is already approved, so every trade gets a quote the moment a request goes out.
    const pricing: ProviderPricing | null = live
      ? { messages: [{ who: "agent", text: "Your pricing is live. Tell me if anything changes." }], draft: p.rateCard, asks: [], status: "live", approvedAt: new Date().toISOString() }
      : null;
    const existing = db.select().from(schema.providers).where(eq(schema.providers.name, p.name)).get();
    if (existing) {
      // Only move it (and fill in a missing description or pricing); keep rate card, rating, profile and pricing changes made in /pro.
      db.update(schema.providers).set({ lat: p.lat, lng: p.lng, radiusKm: p.radiusKm, description: existing.description ?? p.description, pricing: existing.pricing ?? pricing }).where(eq(schema.providers.id, existing.id)).run();
    } else {
      db.insert(schema.providers).values({ ...p, pricing }).run();
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
