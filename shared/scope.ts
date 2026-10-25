// Scope: trade templates, pricing (each pro's hourly rates × the agent's estimate) and the API shapes shared by
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

// ---------- Pricing (each pro's rates × the spec agent's estimate of hours and parts) ----------

/**
 * A pro's rates, in Canadian dollars. Set in /pro → Pricing by chatting with the pricing agent.
 * callOut covers the visit and the first hour; each hour after costs `hourly`; parts are billed at
 * cost plus `partsMarkupPct`. Quotes over `approveOver` go to the pro instead of being sent automatically.
 */
const rateCardShape = z.object({
  callOut: z.number().min(0).max(100000),
  hourly: z.number().min(0).max(100000),
  partsMarkupPct: z.number().min(0).max(200),
  approveOver: z.number().min(0).max(100000),
});
export type RateCard = z.infer<typeof rateCardShape>;

export const DEFAULT_RATES: RateCard = { callOut: 120, hourly: 90, partsMarkupPct: 15, approveOver: 600 };

const round5 = (n: number) => Math.round(n / 5) * 5;

/**
 * Any stored rate card → the current shape. Cards saved before the hourly model
 * (`base` / `per_m2` / `severity_multiplier`) keep their base as the call-out.
 */
export function toRateCard(v: unknown): RateCard {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
  if (num(o.callOut) !== undefined) {
    return {
      callOut: num(o.callOut)!,
      hourly: num(o.hourly) ?? DEFAULT_RATES.hourly,
      partsMarkupPct: num(o.partsMarkupPct) ?? DEFAULT_RATES.partsMarkupPct,
      approveOver: num(o.approveOver) ?? DEFAULT_RATES.approveOver,
    };
  }
  const base = num(o.base);
  return base === undefined ? { ...DEFAULT_RATES } : { ...DEFAULT_RATES, callOut: round5(base), hourly: round5(base * 0.75) };
}
export const rateCardSchema = z.preprocess(toRateCard, rateCardShape);

export const COMPLEXITIES = ["low", "medium", "high"] as const;
export type Complexity = (typeof COMPLEXITIES)[number];

/** Hours of work for a spec without the agent's estimate (older specs): from its severity. */
const SEVERITY_HOURS = [1, 1.5, 2, 3, 4.5];

/** What the spec agent estimates for a job. Every pro's price comes from these and their own rates. */
export type JobEstimate = { severity: number; hours?: number | null; partsCost?: number | null };

export const PRICE_SPREAD = 0.15;

/**
 * price = callOut (incl. 1st hour) + (hours − 1) × hourly + parts × (1 + markup); range = price ± 15%.
 * The breakdown is what /pro shows as the agent's estimate.
 */
export function quote(card: RateCard, job: JobEstimate) {
  const c = toRateCard(card);
  const sev = Math.min(5, Math.max(1, Math.round(job.severity)));
  const hours = job.hours != null && job.hours > 0 ? job.hours : SEVERITY_HOURS[sev - 1];
  const extra = round5(Math.max(0, hours - 1) * c.hourly);
  const parts = round5(Math.max(0, job.partsCost ?? 0) * (1 + c.partsMarkupPct / 100));
  const price = round5(c.callOut + extra + parts);
  return { hours, callOut: c.callOut, extra, parts, price, low: round5(price * (1 - PRICE_SPREAD)), high: round5(price * (1 + PRICE_SPREAD)) };
}
export type Quote = ReturnType<typeof quote>;

/** Over the pro's limit: the agent doesn't send it; the pro reviews the request. */
export const needsApproval = (card: RateCard, q: Pick<Quote, "price">) => q.price > toRateCard(card).approveOver;

/** Typical rates per trade, for a homeowner estimate when no pro near them has rates for the job. */
export const DEFAULT_RATE_CARDS: Record<string, RateCard> = {
  mold: { callOut: 150, hourly: 95, partsMarkupPct: 15, approveOver: 1200 },
  plumbing_sink: { callOut: 120, hourly: 90, partsMarkupPct: 15, approveOver: 600 },
  electrical: { callOut: 130, hourly: 100, partsMarkupPct: 15, approveOver: 700 },
  handyman: { callOut: 80, hourly: 65, partsMarkupPct: 10, approveOver: 500 },
  roofing: { callOut: 180, hourly: 110, partsMarkupPct: 20, approveOver: 1500 },
  painting: { callOut: 100, hourly: 60, partsMarkupPct: 10, approveOver: 1200 },
  garden: { callOut: 70, hourly: 55, partsMarkupPct: 10, approveOver: 500 },
  appliances: { callOut: 110, hourly: 90, partsMarkupPct: 15, approveOver: 600 },
};
export const FALLBACK_RATE_CARD: RateCard = DEFAULT_RATES;

/** /pro → Pricing: the pro's chat with the pricing agent, the rates it drafted, and what it asks homeowners. */
export type PricingMessage = { who: "agent" | "pro"; text: string };
export type ProviderPricing = {
  messages: PricingMessage[];
  draft: RateCard;
  /** Things the agent asks homeowners on this pro's jobs (plain words, no trade terms). */
  asks: string[];
  /** live: approved; the agent quotes and sends offers with these rates. */
  status: "draft" | "live";
  approvedAt: string | null;
};

/**
 * Working hours: 7 days (Monday first) × 48 half-hour cells, true = open for bookings.
 * Set in /pro → Schedule; offers and slots only fall inside them.
 */
export type WeekHours = boolean[][];
const halfHours = (...spans: [number, number][]) => Array.from({ length: 48 }, (_, i) => spans.some(([a, b]) => i >= a && i < b));
/** Mon–Fri 8–12 and 1–5, Sat 9–1, Sunday closed. */
export const DEFAULT_HOURS: WeekHours = [
  ...Array.from({ length: 5 }, () => halfHours([16, 24], [26, 34])),
  halfHours([18, 26]),
  halfHours(),
];

/** Below this the spec is flagged "Low confidence" for the pro. The homeowner still gets a price. */
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
  /** The spec agent's estimate of the work: hours, how complex, and parts at cost (CAD). Null on older specs. */
  hours: number | null;
  complexity: Complexity | null;
  partsCost: number | null;
  fields: Record<string, string>;
  /** Range for the provider the spec was priced for, or a best-guess estimate when none matched. */
  priceLow: number | null;
  priceHigh: number | null;
  /** Set for a best-guess estimate (no pro's rate card): one line on what it's based on. Null for pro prices. */
  priceBasis: string | null;
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
  /** Sent by the pro's pricing agent (their approved rates), not by hand. */
  byAgent: boolean;
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
/** One address type-ahead suggestion: "1000 Rue Sherbrooke Ouest" / "Montreal, Quebec", plus where it is. */
export type AddressSuggestion = { address: string; line1: string; line2: string; lat: number; lng: number };

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
    /** The questions agent's follow-up questions for this scan; null until written (see POST /api/scans/:id/questions). */
    questions: Question[] | null;
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
  /** This pro's price: their rates × the agent's estimate of hours and parts. */
  quote: Quote;
  /** Over the pro's "send to me" limit: the agent didn't send an offer automatically. */
  needsApproval: boolean;
  /** The homeowner: full name once the job is this pro's, else the first name. */
  client: string;
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
  /** Set in /pro → Pricing (read-only here). */
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
 * pricing    (older profiles only) questions done, waiting for prices; finished on the next load
 * complete   facts and description are saved (prices are set separately, in Pricing)
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
export type ProfileView = { status: ProfileStatus; profile: ProProfile | null; description: string | null; website: string | null };

export function profileStatus(p: { profile: ProProfile | null; description: string | null }): ProfileStatus {
  if (p.profile?.stage === "complete") return "complete";
  if (p.profile) return "in_progress";
  return p.description?.trim() ? "summary_only" : "not_started";
}

/** The interview asks at least this many questions and never more than the cap. */
export const PROFILE_MIN_QUESTIONS = 4;
export const PROFILE_MAX_QUESTIONS = 8;

export type ProJobDetail = {
  job: ScopeJobInfo;
  scan: ScanResponse["scan"];
  template: Template;
  home: { address: string; lat: number; lng: number };
  photos: ScanPhotoInfo[];
  spec: JobSpecInfo;
  /** This pro's price: their rates × the agent's estimate of hours and parts, with the breakdown. */
  quote: Quote;
  needsApproval: boolean;
  /** The homeowner: full name once the job is this pro's, else the first name. */
  client: string;
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

/** Prices are Canadian dollars: "CA$1,240". */
export const cad = (n: number) => `CA$${Math.round(n).toLocaleString("en-CA")}`;
export const priceRange = (low: number, high: number) => `${cad(low)} – ${cad(high)}`;

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
