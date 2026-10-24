// Scope: trade templates, pricing (rate card + bounded AI adjustment) and the API shapes shared by
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
  /** What severity 1..5 means for this trade (the spec agent's rubric). Optional: a generic scale is used without it. */
  severity_guide: z.array(z.string().min(1)).length(5).optional(),
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

// ---------- Pricing (rate card formula; the pricing agent may only nudge it by ±PRICE_ADJUST_MAX%) ----------

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

/** The pricing agent can move a pro's formula price by at most this many percent either way. */
export const PRICE_ADJUST_MAX = 40;

/** The pricing agent's suggestion for one pro on one spec. Stored as a percentage, so rate-card edits still apply. */
export type PriceSuggestion = { providerId: number; adjustPct: number; reason: string };

export const clampAdjust = (pct: number) => Math.min(PRICE_ADJUST_MAX, Math.max(-PRICE_ADJUST_MAX, Math.round(pct)));

/** The formula price moved by the agent's adjustment (clamped here too), with the same ±15% range. */
export function suggestedQuote(card: RateCard, spec: { severity: number; areaM2: number }, adjustPct = 0): Quote {
  const base = quote(card, spec).price;
  const price = base * (1 + clampAdjust(adjustPct) / 100);
  return { price: round5(price), low: round5(price * (1 - PRICE_SPREAD)), high: round5(price * (1 + PRICE_SPREAD)) };
}

/** This pro's suggestion on a spec, if the pricing agent made one. */
export const suggestionFor = (spec: { priceSuggestions?: PriceSuggestion[] | null }, providerId: number) =>
  spec.priceSuggestions?.find((x) => x.providerId === providerId) ?? null;

/** Confidence below this hands the scan to a human, with the spec attached. */
export const HANDOFF_CONFIDENCE = 0.6;

// ---------- Statuses ----------

export const SCAN_STATUSES = ["capturing", "clarifying", "spec_ready", "submitted", "cancelled"] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

/**
 * open         sent to every matching pro at once; collecting offers (Pro tab: New)
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
export const JOB_STATUSES = ["open", "pending", "handoff", "virtual_call", "more_info", "accepted", "en_route", "done", "declined", "cancelled"] as const;
export type ScopeJobStatus = (typeof JOB_STATUSES)[number];

export const PRO_TABS = {
  // more_info stays in New (badged "Waiting for homeowner") until the homeowner replies.
  new: ["open", "pending", "more_info"],
  review: ["handoff", "virtual_call"],
  active: ["accepted", "en_route"],
  done: ["done"],
} as const satisfies Record<string, readonly ScopeJobStatus[]>;
export type ProTab = keyof typeof PRO_TABS;

/**
 * active     waiting for the homeowner
 * withdrawn  the pro took it back
 * accepted   the homeowner picked it
 * lost       the homeowner picked someone else (or cancelled)
 * stale      the spec changed after it was sent; the pro should re-send
 */
export const OFFER_STATUSES = ["active", "withdrawn", "accepted", "lost", "stale"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

/** Sanity bounds for a pro's offer. The rate card is only a suggestion. */
export const OFFER_MAX_PRICE = 100000;

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
  /** The matching agent's one-line reason this pro fits the job (null without the agent). */
  fitReason: string | null;
};

/** One pro in the matching agent's ranking for a spec. score 0-100; below FIT_MIN means a poor fit. */
export type ProviderFit = { providerId: number; score: number; reason: string };
export const FIT_MIN = 40;

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

/** `providerId` is the pro who asked, when the job was open to several pros. */
export type MoreInfoRequest = { shotIds: string[]; questionIds: string[]; message: string | null; providerId?: number | null };

export type OfferInfo = {
  id: number;
  provider: { id: number; name: string; rating: number; ratingCount: number };
  distanceKm: number;
  etaMinutes: number;
  price: number;
  slot: string;
  status: OfferStatus;
  createdAt: string;
  updatedAt: string;
};

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

export type HomeInfo = { id: number; label: string; address: string; lat: number; lng: number; homeType: string | null };

/** Where the homeowner marked the problem on a photo: x and y in % of the photo's width and height. */
export type PhotoMark = { shotId: string; x: number; y: number };

export const HOME_TYPES = ["Apartment", "House", "Condo", "Townhouse", "Other"] as const;

/** GET/PUT /api/profile: the homeowner's own details and home. */
export type ProfileInfo = {
  name: string;
  email: string | null;
  phone: string | null;
  age: number | null;
  address: string | null;
  homeType: string | null;
};

/** POST /api/auth/code/verify. `isNew`: the account was just created, so the app asks for a name and home. */
export type CodeLoginResponse = { token: string; isNew: boolean };

/**
 * POST /api/intake/classify: the AI's best guess at the trade from what the homeowner said and/or showed,
 * two alternatives to offer if it's wrong, and which of the trade's shots the photo already covers.
 */
export type ClassifyResult = {
  trade: string;
  label: string;
  summary: string;
  alternatives: { trade: string; label: string }[];
  /** Only with a photo: the top trade's shot it fits, so it's reused instead of retaken. */
  shotId: string | null;
};

/** Answers to template questions are one of the options, or the homeowner's own words (up to this long). */
export const FREE_ANSWER_MAX = 200;

export const REVIEW_TAGS = ["On time", "Tidy", "Fair price", "Clear communication"] as const;

export type ScanResponse = {
  scan: {
    id: number;
    trade: string;
    status: ScanStatus;
    answers: Record<string, string>;
    notes: string | null;
    skippedShots: string[];
    /** What the homeowner said on the voice screen. */
    description: string | null;
    mark: PhotoMark | null;
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
  /** Active offers while the job is open, cheapest first. */
  offers: OfferInfo[];
  /** How many pros the open request went to, and how many passed. */
  invitedCount: number;
  passedCount: number;
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
  /** The booked time (or the time the homeowner asked for, until the pro confirms). */
  slot: string | null;
  slotConfirmed: boolean;
  /** Stars the homeowner gave, once rated. */
  rating: number | null;
  /** The pro's "ask for more", while the job is more_info. */
  request: MoreInfoRequest | null;
  /** Active offers while the job is open. */
  offerCount: number;
  /** Cheapest active offer, for the notification text. */
  bestOffer: { price: number; providerName: string } | null;
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
  /** Suggested price for this pro: rate card formula, adjusted by the pricing agent. */
  quote: Quote;
  /** The pricing agent's one-line reason (null: plain formula price). */
  priceReason: string | null;
  distanceKm: number;
  /** This pro's offer on an open job (any status). */
  myOffer: OfferInfo | null;
  invitedCount: number;
  /** What the homeowner said on the app's voice screen. */
  description: string | null;
  /** Confirmed visit or call time, once accepted. */
  slot: string | null;
  mode: "onsite" | "virtual";
  /** Only for this pro's own jobs. */
  address: string | null;
  /** The homeowner's stars, once rated. */
  rating: number | null;
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
  /** Written by the profile interview's pricing step (read-only here). */
  rateCard: RateCard;
  offersVirtual: boolean;
  /** What the pro specializes in. The matching agent reads it. */
  description: string | null;
  profileStatus: ProfileStatus;
  /** Structured facts from the profile interview, once complete. */
  profileFacts: ProfileFacts | null;
};

export const DESCRIPTION_MAX = 1000;

// ---------- Pro profile interview ----------

/** One question the profile agent asks. The pro taps one (or several, if `multi`) options and can add a note. */
export const profileQuestionSchema = z.object({
  id: z.string(),
  q: z.string(),
  options: z.array(z.string()),
  multi: z.boolean(),
});
export type ProfileQuestion = z.infer<typeof profileQuestionSchema>;
export type ProfileTurn = ProfileQuestion & { answer: string[]; note: string | null };

export const profileFactsSchema = z.object({
  specialties: z.array(z.string()),
  jobSizes: z.string(),
  availability: z.string(),
  notes: z.string(),
});
export type ProfileFacts = z.infer<typeof profileFactsSchema>;

/**
 * interview  the agent is asking questions (`pending` is the open one)
 * pricing    questions done; the pro enters their prices (no AI)
 * complete   facts, description and rate card are saved
 */
export type ProProfile = {
  stage: "interview" | "pricing" | "complete";
  turns: ProfileTurn[];
  pending: ProfileQuestion | null;
  facts: ProfileFacts | null;
  /** Agent-written summary, saved as the description when the pro finishes. */
  draftDescription: string | null;
  completedAt: string | null;
};

export type ProfileStatus = "not_started" | "summary_only" | "in_progress" | "complete";

/** GET /api/pro/profile, and what each interview step returns. */
export type ProfileView = { status: ProfileStatus; profile: ProProfile | null; description: string | null; website: string | null; rateCard: RateCard; pricing: ProfilePricing };

export function profileStatus(p: { profile: ProProfile | null; description: string | null }): ProfileStatus {
  if (p.profile?.stage === "complete") return "complete";
  if (p.profile) return "in_progress";
  return p.description?.trim() ? "summary_only" : "not_started";
}

/** The interview asks at least this many questions and never more than the cap. */
export const PROFILE_MIN_QUESTIONS = 4;
export const PROFILE_MAX_QUESTIONS = 8;

/** What the pro enters in the pricing step. Turned into the rate card in code; the pricing agent only adjusts within ±PRICE_ADJUST_MAX%. */
export const profilePricingSchema = z.object({
  callOut: z.number({ error: "Enter your call-out fee." }).min(0, "Prices can't be negative.").max(100000),
  perM2: z.number({ error: "Enter your price per m²." }).min(0, "Prices can't be negative.").max(100000),
  severePct: z.number({ error: "Enter the extra for severe jobs." }).min(0, "The extra can't be negative.").max(1000),
});
export type ProfilePricing = z.infer<typeof profilePricingSchema>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** severity 1-2 at the base price, then ramping up to +severePct% at severity 5. */
export function rateCardFromPricing(p: ProfilePricing): RateCard {
  const s = p.severePct / 100;
  return { base: p.callOut, per_m2: p.perM2, severity_multiplier: [1, 1, round2(1 + s * 0.4), round2(1 + s * 0.7), round2(1 + s)] };
}

/** The pricing step's prefill from an existing rate card. */
export function pricingFromRateCard(c: RateCard): ProfilePricing {
  return { callOut: c.base, perM2: c.per_m2, severePct: Math.round(((c.severity_multiplier[4] ?? 1) - 1) * 100) };
}

export type ProJobDetail = {
  job: ScopeJobInfo;
  scan: ScanResponse["scan"];
  template: Template;
  home: { address: string; lat: number; lng: number };
  photos: ScanPhotoInfo[];
  spec: JobSpecInfo;
  /** Suggested price for this pro: current rate card formula, adjusted by the pricing agent. */
  quote: Quote;
  /** The pricing agent's one-line reason (null: plain formula price). */
  priceReason: string | null;
  slots: Slot[];
  /** This pro's offer on an open job (any status). */
  myOffer: OfferInfo | null;
  invitedCount: number;
  /** Readable answers: question text → answer. */
  answers: { id: string; q: string; answer: string }[];
  /** The event in this provider's Google Calendar, if they're connected and accepted it. */
  calendarLink: string | null;
  /** Why the matching agent picked this pro for the job, if it ranked them. */
  fitReason: string | null;
};

// ---------- Small helpers ----------

export const SEVERITY_LABELS = ["", "Minor", "Light", "Moderate", "Significant", "Severe"];

export const JOB_STATUS_LABELS: Record<ScopeJobStatus, string> = {
  open: "Collecting offers",
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
  spec_ready: "Ready to request",
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
