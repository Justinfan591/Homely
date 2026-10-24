import type { Home, Job, JobSpec, Provider, Scan } from "@/domain/types";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export const homes: Home[] = [
  { id: "home_lakeview", name: "Lakeview house", address: "142 Lakeview Ave, Toronto", lat: 43.6532, lng: -79.3832 },
  { id: "home_cottage", name: "Georgian Bay cottage", address: "18 Pine Point Rd, Honey Harbour", lat: 44.8582, lng: -79.8211 },
];

export const providers: Provider[] = [
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
    photos: ["wide_sink", "under_sink", "closeup_leak"].map((shotId) => ({ shotId, uri: "", ok: true })),
    skipped: [],
    pendingShotIds: ["shutoff_valve"],
    answers: { when: "Only when in use", water_off: "No", damage: "Not sure" },
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
    moistureSource: "Possible condensation near the window",
    recommendedService: "On-site inspection and moisture testing",
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
    moistureSource: "Visible moisture near the drain connection",
    recommendedService: "Leak inspection and repair",
    createdAt: daysAgo(1),
  },
];

export const seedJobs: Job[] = [
  {
    id: "job_done",
    specId: "spec_done",
    scanId: "scan_done",
    homeId: "home_lakeview",
    providerName: "Mold Busters",
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
