import type { Home, Job, JobSpec, Provider, Scan } from "@/domain/types";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export const homes: Home[] = [
  { id: "home_lakeview", name: "Lakeview house", address: "142 Lakeview Ave, Toronto", lat: 43.6532, lng: -79.3832 },
  { id: "home_cottage", name: "Georgian Bay cottage", address: "18 Pine Point Rd, Honey Harbour", lat: 44.8582, lng: -79.8211 },
];

// Two pros for each of the newer trades, near the Lakeview house.
const more: [string, string, number, number][] = [
  ["electrical", "Bright Spark Electric", 4.9, 156],
  ["electrical", "Volt & Co", 4.6, 58],
  ["handyman", "Fix-It Fred", 4.8, 201],
  ["handyman", "Odd Jobs Collective", 4.5, 77],
  ["locksmith", "KeyPoint Locksmiths", 4.9, 310],
  ["locksmith", "Secure Home Locks", 4.6, 64],
  ["painting", "Fresh Coat Painters", 4.8, 122],
  ["painting", "Odd Jobs Painting", 4.5, 40],
  ["garden", "Greenleaf Gardens", 4.7, 95],
  ["garden", "Yard Pros", 4.5, 40],
  ["appliances", "ApplianceDoc", 4.8, 188],
  ["appliances", "QuickFix Appliance", 4.4, 52],
];

export const providers: Provider[] = [
  ...more.map(([trade, name, rating, reviews], i): Provider => ({
    id: name.toLowerCase().replace(/[^a-z]+/g, "_"),
    name,
    trades: [trade],
    lat: 43.6532 + ((i % 3) - 1) * 0.02,
    lng: -79.3832 + ((i % 4) - 1.5) * 0.02,
    radiusKm: 30,
    rating,
    reviews,
    rateCard: { base: 80 + (i % 4) * 15, perM2: 10, severityMultiplier: [1, 1.1, 1.4, 1.8, 2.3] },
    etaMinutes: 25 + (i % 5) * 8,
  })),
  {
    id: "mold_busters",
    name: "Mold Busters",
    trades: ["mold"],
    lat: 43.6711,
    lng: -79.4002,
    radiusKm: 40,
    rating: 4.9,
    reviews: 212,
    rateCard: { base: 150, perM2: 40, severityMultiplier: [1, 1, 1.2, 1.5, 2] },
    etaMinutes: 45,
  },
  {
    id: "clearwater",
    name: "Clearwater Restoration",
    trades: ["mold"],
    lat: 43.7315,
    lng: -79.2624,
    radiusKm: 30,
    rating: 4.7,
    reviews: 98,
    rateCard: { base: 120, perM2: 55, severityMultiplier: [1, 1.1, 1.3, 1.6, 2.1] },
    etaMinutes: 25,
  },
  {
    id: "northside",
    name: "Northside Plumbing",
    trades: ["plumbing_sink"],
    lat: 43.6896,
    lng: -79.3953,
    radiusKm: 30,
    rating: 4.8,
    reviews: 341,
    rateCard: { base: 140, perM2: 90, severityMultiplier: [1, 1, 1.15, 1.4, 1.8] },
    etaMinutes: 35,
  },
  {
    id: "dripdrop",
    name: "Drip Drop Plumbers",
    trades: ["plumbing_sink"],
    lat: 43.6205,
    lng: -79.5132,
    radiusKm: 25,
    rating: 4.6,
    reviews: 77,
    rateCard: { base: 110, perM2: 80, severityMultiplier: [1, 1, 1.2, 1.5, 1.9] },
    etaMinutes: 20,
  },
];

// A finished job from last month, so the Home Record isn't empty.
export const seedScans: Scan[] = [
  {
    id: "scan_done",
    homeId: "home_lakeview",
    trade: "mold",
    photos: ["wide_room", "closeup_affected", "ceiling_above", "adjacent_wall", "likely_water_source"].map((shotId) => ({
      shotId,
      uri: "",
      ok: true,
    })),
    skipped: [],
    pendingShotIds: [],
    answers: { duration: "1-4 weeks", smell: "Yes", leak: "No" },
    note: "",
    createdAt: daysAgo(34),
  },
  {
    // A pro asked for one more photo before accepting.
    id: "scan_followup",
    homeId: "home_lakeview",
    trade: "plumbing_sink",
    photos: ["under_sink_wide", "leak_closeup", "faucet_top"].map((shotId) => ({ shotId, uri: "", ok: true })),
    skipped: [],
    pendingShotIds: ["shutoff_valves"],
    answers: { leak_rate: "Slow drip", water_off: "No", age: "Not sure" },
    note: "",
    createdAt: daysAgo(1),
    followUp: {
      provider: "Northside Plumbing",
      message: "Could you show us the shut-off valves under the sink? It helps us bring the right parts.",
    },
  },
];

export const seedSpecs: JobSpec[] = [
  {
    id: "spec_done",
    scanId: "scan_done",
    trade: "mold",
    title: "Visible growth likely",
    summary: "Dark patches along the wall–ceiling corner. Visible growth is likely; testing is recommended.",
    severity: 3,
    areaM2: 1.6,
    confidence: 0.86,
    fields: [
      { label: "Likely moisture source", value: "Possible condensation near the window" },
      { label: "Recommended service", value: "On-site inspection and moisture testing" },
    ],
    createdAt: daysAgo(34),
  },
  {
    id: "spec_followup",
    scanId: "scan_followup",
    trade: "plumbing_sink",
    title: "Likely leak under the sink",
    summary: "Moisture visible around the drain connection. A plumber will confirm the source.",
    severity: 2,
    areaM2: 0.4,
    confidence: 0.78,
    fields: [
      { label: "Leak location", value: "Drain connection under the sink" },
      { label: "Recommended service", value: "Leak inspection and repair" },
    ],
    createdAt: daysAgo(1),
  },
];

export const seedJobs: Job[] = [
  {
    id: "job_done",
    specId: "spec_done",
    scanId: "scan_done",
    homeId: "home_lakeview",
    trade: "mold",
    title: "Visible growth likely",
    address: "142 Lakeview Ave, Toronto",
    providerName: "Mold Busters",
    providerPhone: "555-0150",
    providerRating: 4.9,
    status: "done",
    slot: { id: "past", start: daysAgo(30), label: "" },
    price: { low: 335, high: 450 },
    etaMinutes: null,
    rating: 5,
    createdAt: daysAgo(33),
    virtual: false,
  },
];
