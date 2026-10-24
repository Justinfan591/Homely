// Scope: trade templates, deterministic pricing and the API shapes shared by
// the server, the Expo app and the /pro dashboard. Safe to import anywhere.
import { z } from "zod";

// ---------- Trade templates (/templates/*.json) ----------

export const shotSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  prompt: z.string().min(1),
  /** Extra detail for the vision check: what this shot must show. */
  hint: z.string().optional(),
  /** Optional shots can be skipped (e.g. there is no wall next to it). */
  optional: z.boolean().default(false),
  skip_label: z.string().optional(),
});

export const questionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  q: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  optional: z.boolean().default(false),
});

export const templateSchema = z.object({
  trade: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string(),
  description: z.string(),
  required_shots: z.array(shotSchema).min(1),
  questions: z.array(questionSchema),
  notes: z.object({ enabled: z.boolean().default(true), prompt: z.string() }).default({ enabled: true, prompt: "Anything else we should know?" }),
  /** Keys the AI must fill. `severity` and `affected_area_m2` are always produced. */
  outputs: z.array(z.string().regex(/^[a-z0-9_]+$/)).min(1),
  output_labels: z.record(z.string(), z.string()).default({}),
  /** Wording rules shown in the UI and enforced in the prompt. */
  policy: z.object({
    /** Required standard phrasing, e.g. "Visible growth likely, testing recommended." */
    finding_wording: z.string(),
    /** Extra rules for the AI, e.g. never name a species. */
    rules: z.array(z.string()).default([]),
  }),
  virtual_call_label: z.string().default("Book a virtual assessment"),
});
export type Template = z.infer<typeof templateSchema>;
export type Shot = Template["required_shots"][number];
export type Question = Template["questions"][number];

// ---------- Pricing (deterministic; the AI never prices) ----------

export const rateCardSchema = z.object({
  base: z.number().min(0).max(100000),
  per_m2: z.number().min(0).max(100000),
  severity_multiplier: z.array(z.number().min(0).max(20)).length(5),
});
export type RateCard = z.infer<typeof rateCardSchema>;

export const PRICE_SPREAD = 0.15;
const round5 = (n: number) => Math.round(n / 5) * 5;

/** price = (base + per_m2 × area) × severity_multiplier[severity-1]; range = price ± 15%. */
export function quote(card: RateCard, spec: { severity: number; areaM2: number }) {
  const sev = Math.min(5, Math.max(1, Math.round(spec.severity)));
  const area = Math.max(0, spec.areaM2);
  const price = (card.base + card.per_m2 * area) * (card.severity_multiplier[sev - 1] ?? 1);
  return { price: round5(price), low: round5(price * (1 - PRICE_SPREAD)), high: round5(price * (1 + PRICE_SPREAD)) };
}
export type Quote = ReturnType<typeof quote>;

/** Confidence below this hands the scan to a human, with the spec attached. */
export const HANDOFF_CONFIDENCE = 0.6;

// ---------- Statuses ----------

export const SCAN_STATUSES = ["capturing", "clarifying", "spec_ready", "submitted", "cancelled"] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

/**
 * pending      homeowner booked, waiting for the pro (Pro tab: New)
 * handoff      low confidence; a human reviews the spec (Pro tab: Needs review)
 * virtual_call no pro in range; homeowner asked for a virtual call (Needs review)
 * more_info    pro asked for more photos/answers; homeowner's turn
 * accepted     pro picked a slot and confirmed the price (Active)
 * en_route     pro is on the way (Active)
 * done         finished; homeowner can rate (Done)
 * declined     pro declined; homeowner can book the next pro
 * cancelled    homeowner cancelled
 */
export const JOB_STATUSES = ["pending", "handoff", "virtual_call", "more_info", "accepted", "en_route", "done", "declined", "cancelled"] as const;
export type ScopeJobStatus = (typeof JOB_STATUSES)[number];

export const PRO_TABS = {
  // more_info stays in New (badged "Waiting for homeowner") until the homeowner replies.
  new: ["pending", "more_info"],
  review: ["handoff", "virtual_call"],
  active: ["accepted", "en_route"],
  done: ["done"],
} as const satisfies Record<string, readonly ScopeJobStatus[]>;
export type ProTab = keyof typeof PRO_TABS;

export const ESTIMATE_LABEL = "Estimate — confirmed by provider";

// ---------- API shapes ----------

export type Slot = { id: string; startsAt: string };

export type ProviderMatch = {
  id: number;
  name: string;
  rating: number;
  ratingCount: number;
  distanceKm: number;
  etaMinutes: number;
  quote: Quote;
  slots: Slot[];
};

export type ScanPhotoInfo = {
  id: number;
  shotId: string;
  /** Needs the homeowner's bearer token (or ?provider=<id> on /pro). */
  url: string;
  /** Signed link that works on its own for 24 h: use it directly in <img src>. Relative to the API server. */
  src: string;
  ok: boolean;
  feedback: string | null;
};

export type JobSpecInfo = {
  id: number;
  version: number;
  trade: string;
  title: string;
  summary: string;
  severity: number;
  areaM2: number;
  confidence: number;
  fields: Record<string, string>;
  /** Range for the provider the spec was priced for (null when none matched). */
  priceLow: number | null;
  priceHigh: number | null;
  createdAt: string;
};

export type MoreInfoRequest = { shotIds: string[]; questionIds: string[]; message: string | null };

export type ScopeJobInfo = {
  id: number;
  status: ScopeJobStatus;
  mode: "onsite" | "virtual";
  provider: { id: number; name: string; rating: number; ratingCount: number; phone: string | null } | null;
  distanceKm: number | null;
  slot: string | null;
  /** The time the homeowner asked for when booking (the pro confirms `slot`). */
  requestedSlot: string | null;
  /** When the pro is expected (slot start once accepted; arrival time once en route). */
  eta: string | null;
  price: number | null;
  request: MoreInfoRequest | null;
  rating: number | null;
  createdAt: string;
  updatedAt: string;
};

export type HomeInfo = { id: number; label: string; address: string; lat: number; lng: number };

export type ScanResponse = {
  scan: {
    id: number;
    trade: string;
    status: ScanStatus;
    answers: Record<string, string>;
    notes: string | null;
    skippedShots: string[];
    /** Set while the homeowner is answering a pro's "ask for more". */
    focus: MoreInfoRequest | null;
    createdAt: string;
  };
  template: Template;
  home: HomeInfo;
  photos: ScanPhotoInfo[];
  /** Shots still to capture, in order (respects focus). */
  remainingShots: string[];
  spec: JobSpecInfo | null;
  job: ScopeJobInfo | null;
  /** Ranked providers for this spec (only while choosing / after a decline). */
  matches: ProviderMatch[];
};

export type ShotResult = { ok: boolean; message: string; remainingShots: string[]; status: ScanStatus };

export type HomeRecordItem = {
  scanId: number;
  trade: string;
  tradeLabel: string;
  title: string;
  scanStatus: ScanStatus;
  jobStatus: ScopeJobStatus | null;
  providerName: string | null;
  priceLow: number | null;
  priceHigh: number | null;
  price: number | null;
  /** The pro's "ask for more", while the job is more_info. */
  request: MoreInfoRequest | null;
  /** Signed link to the first usable photo, for a thumbnail. */
  photoSrc: string | null;
  needsAction: boolean;
  updatedAt: string;
};
export type HomeResponse = { home: HomeInfo | null; record: HomeRecordItem[] };

export type TemplateSummary = { trade: string; label: string; description: string; shots: number; questions: number };

// ---------- Pro dashboard shapes ----------

export type ProQueueCard = {
  jobId: number;
  scanId: number;
  status: ScopeJobStatus;
  trade: string;
  tradeLabel: string;
  title: string;
  severity: number;
  areaM2: number;
  confidence: number;
  quote: Quote;
  distanceKm: number;
  createdAt: string;
  updatedAt: string;
};
export type ProQueueResponse = { provider: ProProvider; tabs: Record<ProTab, ProQueueCard[]> };

export type ProProvider = {
  id: number;
  name: string;
  trades: string[];
  lat: number;
  lng: number;
  radiusKm: number;
  rating: number;
  ratingCount: number;
  rateCard: RateCard;
  offersVirtual: boolean;
};

export type ProJobDetail = {
  job: ScopeJobInfo;
  scan: ScanResponse["scan"];
  template: Template;
  home: { address: string; lat: number; lng: number };
  photos: ScanPhotoInfo[];
  spec: JobSpecInfo;
  /** Priced with this provider's current rate card. */
  quote: Quote;
  slots: Slot[];
  /** Readable answers: question text → answer. */
  answers: { id: string; q: string; answer: string }[];
};

// ---------- Small helpers ----------

export const SEVERITY_LABELS = ["", "Minor", "Light", "Moderate", "Significant", "Severe"];

export const JOB_STATUS_LABELS: Record<ScopeJobStatus, string> = {
  pending: "Waiting for the pro",
  handoff: "Specialist reviewing",
  virtual_call: "Virtual call requested",
  more_info: "Pro needs more info",
  accepted: "Booked",
  en_route: "Pro on the way",
  done: "Done",
  declined: "Pro unavailable",
  cancelled: "Cancelled",
};

export const SCAN_STATUS_LABELS: Record<ScanStatus, string> = {
  capturing: "Scan in progress",
  clarifying: "A few questions left",
  spec_ready: "Ready to book",
  submitted: "Submitted",
  cancelled: "Cancelled",
};

export const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export const priceRange = (low: number, high: number) => `${usd(low)} – ${usd(high)}`;

/** "2:00 PM" in the viewer's time zone. */
export const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** "Today 2:00 PM", "Tomorrow 9:00 AM" or "Mon 9:00 AM" in the viewer's time zone. */
export function slotLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86400000);
  const prefix = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${prefix} ${timeLabel(iso)}`;
}
