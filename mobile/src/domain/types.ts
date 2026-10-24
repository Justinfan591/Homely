// Domain models. The UI only depends on these, never on a backend schema.

export type TradeId = string; // "mold" | "plumbing_sink" | any future template id

export type Shot = {
  id: string;
  prompt: string;
  /** Short coaching line shown under the prompt. */
  tip?: string;
  /** Present when the shot can legitimately not apply (e.g. a wall with one side). */
  skipLabel?: string;
};

export type Question = { id: string; q: string; options: string[] };

export type TradeTemplate = {
  trade: TradeId;
  title: string;
  /** Short blurb for the trade picker. */
  blurb: string;
  icon: string;
  requiredShots: Shot[];
  questions: Question[];
  notesPrompt: string;
  outputs: string[];
  /** Plain-language label for the measured quantity. */
  areaLabel: string;
};

export type Photo = { shotId: string; uri: string; ok: boolean };

export type Scan = {
  id: string;
  homeId: string;
  trade: TradeId;
  photos: Photo[];
  /** Shot ids the user marked as not applicable. */
  skipped: string[];
  /** Shots still to capture; shrinks as photos are accepted. For follow-ups it is a subset of the template. */
  pendingShotIds: string[];
  answers: Record<string, string>;
  note: string;
  createdAt: string;
  /** Set when a provider asked for more information. */
  followUp?: { provider: string; message: string };
};

export type PhotoVerdict =
  | { ok: true; message: string }
  | { ok: false; reason: "blurry" | "wrong_subject" | "too_dark"; message: string };

export type JobSpec = {
  id: string;
  scanId: string;
  trade: TradeId;
  title: string;
  summary: string;
  severity: 1 | 2 | 3 | 4 | 5;
  areaM2: number;
  confidence: number;
  moistureSource: string;
  recommendedService: string;
  createdAt: string;
};

export type RateCard = { base: number; perM2: number; severityMultiplier: number[] };

export type PriceRange = { low: number; high: number };

export type Provider = {
  id: string;
  name: string;
  trades: TradeId[];
  lat: number;
  lng: number;
  radiusKm: number;
  rating: number;
  reviews: number;
  rateCard: RateCard;
  /** Minutes until a pro could arrive; used for ranking. */
  etaMinutes: number;
};

export type Slot = { id: string; start: string; label: string };

export type MatchOption = {
  provider: Provider;
  distanceKm: number;
  price: PriceRange;
  slots: Slot[];
};

export type Home = { id: string; name: string; address: string; lat: number; lng: number };

export type JobStatus = "pending" | "accepted" | "en_route" | "done" | "handoff";

export type Job = {
  id: string;
  specId: string;
  scanId: string;
  homeId: string;
  providerName: string;
  providerRating: number | null;
  status: JobStatus;
  slot: Slot | null;
  price: PriceRange | null;
  /** Minutes until arrival, when en route. */
  etaMinutes: number | null;
  rating: number | null;
  createdAt: string;
  /** A virtual call booked as a fallback. */
  virtual: boolean;
};

export type RecordStatus =
  | "in_progress"
  | "needs_info"
  | "awaiting"
  | "scheduled"
  | "en_route"
  | "done"
  | "handoff";

/** One row of the Home Record. */
export type RecordItem = {
  id: string;
  trade: TradeId;
  title: string;
  createdAt: string;
  status: RecordStatus;
  price: PriceRange | null;
  photoUri: string | null;
  /** Route to open when tapped. */
  href: string;
  /** Provider's request, when status is needs_info. */
  followUp?: { provider: string; message: string };
};

export type SpecOutcome =
  | { kind: "match"; spec: JobSpec; options: MatchOption[] }
  | { kind: "handoff"; spec: JobSpec }
  | { kind: "no_provider"; spec: JobSpec };
