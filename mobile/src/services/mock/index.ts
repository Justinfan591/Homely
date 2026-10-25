import { matchProviders } from "@/domain/matching";
import { priceRange } from "@/domain/pricing";
import { slotLabel } from "@/domain/format";
import type {
  AddressSuggestion,
  Classification,
  Job,
  JobSpec,
  MatchOption,
  Offer,
  PhotoVerdict,
  Profile,
  RecordItem,
  Scan,
  Slot,
  SpecOutcome,
  TradeId,
} from "@/domain/types";
import { getTemplate, templates } from "@/templates";
import { ApiError, type ScopeApi } from "../api";
import { homes, providers, seedJobs, seedScans, seedSpecs } from "./seed";

/** A few Toronto addresses for the offline type-ahead. */
const MOCK_ADDRESSES: AddressSuggestion[] = [
  { address: "142 Lakeview Ave, Toronto", line1: "142 Lakeview Ave", line2: "Toronto, Ontario", lat: 43.6532, lng: -79.3832 },
  { address: "100 Queen St W, Toronto", line1: "100 Queen St W", line2: "Toronto, Ontario", lat: 43.6525, lng: -79.3839 },
  { address: "290 Bremner Blvd, Toronto", line1: "290 Bremner Blvd", line2: "Toronto, Ontario", lat: 43.6426, lng: -79.3871 },
  { address: "55 Mill St, Toronto", line1: "55 Mill St", line2: "Toronto, Ontario", lat: 43.6503, lng: -79.3596 },
  { address: "18 Pine Point Rd, Honey Harbour", line1: "18 Pine Point Rd", line2: "Honey Harbour, Ontario", lat: 44.8582, lng: -79.8211 },
];

/** Knobs for exercising states that a real backend would produce on its own. */
export const mockConfig = {
  /** The first close-up of every scan fails the vision check, to exercise the retake flow. */
  rejectFirstCloseup: true,
  /** Set to a method name to make its next call fail once. */
  failNext: null as keyof ScopeApi | null,
  /** Job lifecycle pacing (ms). A real backend advances status when the provider acts. */
  acceptAfterMs: 4_000,
  enRouteAfterMs: 10_000,
  etaStepMs: 1_500,
  etaStartMinutes: 14,
  virtualDoneAfterMs: 20_000,
  /** After "Get offers", one pro's offer arrives every this many ms. */
  offerEveryMs: 3_000,
};

// Reachable from the debugger / test scripts (the mock layer is replaced wholesale by the real client).
(globalThis as { __mock?: typeof mockConfig }).__mock = mockConfig;

const scans = new Map<string, Scan>(seedScans.map((s) => [s.id, structuredClone(s)]));
const specs = new Map<string, JobSpec>(seedSpecs.map((s) => [s.id, structuredClone(s)]));
const jobs = new Map<string, Job>(seedJobs.map((j) => [j.id, structuredClone(j)]));
const outcomes = new Map<string, SpecOutcome>();
const attempts = new Map<string, number>();
const retakes = new Map<string, number>();
const simulated = new Set<string>();
/** Offers each pro will send for an open request, revealed one at a time. */
const pendingOffers = new Map<string, Offer[]>();
let counter = 100;

// ---- Session: the demo code is always 7246 ----
const DEMO_CODE = "7246";
let signedIn = false;
const sessionListeners = new Set<(signedIn: boolean) => void>();
const setSignedIn = (v: boolean) => {
  signedIn = v;
  for (const fn of sessionListeners) fn(v);
};
const profile: Profile = { name: "", email: null, phone: null, age: null, address: null, homeType: null };

const TRADE_WORDS: [string, RegExp][] = [
  ["roofing", /roof|shingle|gutter|ceiling leak/i],
  ["plumbing_sink", /leak|drip|sink|faucet|tap|pipe|drain|toilet/i],
  ["mold", /mou?ld|mildew|black spot|musty/i],
  ["electrical", /outlet|socket|switch|breaker|electric|wiring|spark|power/i],
  ["appliances", /fridge|washer|dryer|dishwasher|oven|stove|appliance|freezer/i],
  ["painting", /paint|peel/i],
  ["garden", /garden|lawn|yard|tree|hedge|grass|weed/i],
];

/** A job's fixed details, from its scan and spec. */
function jobBase(scanId: string, specId: string) {
  const scan = need(scans.get(scanId), "Scan");
  const home = need(homes.find((h) => h.id === scan.homeId), "Home");
  return {
    specId,
    scanId,
    homeId: home.id,
    trade: scan.trade,
    title: specs.get(specId)?.title ?? getTemplate(scan.trade).title,
    address: home.address,
    providerPhone: null,
  };
}

const windowSlot = (start: string): Slot => ({ id: start, start, label: slotLabel(new Date(start)) });

const id = (prefix: string) => `${prefix}_${++counter}`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(name: keyof ScopeApi, ms: number, run: () => T): Promise<T> {
  await wait(ms);
  if (mockConfig.failNext === name) {
    mockConfig.failNext = null;
    throw new ApiError("We couldn't reach Scope. Check your connection and try again.");
  }
  return run();
}

function need<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new ApiError(`${what} not found`, "not_found");
  return v;
}

function makeSlots(): Slot[] {
  const now = new Date();
  const at = (dayOffset: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  // A same-day slot only when it lands in working hours; otherwise start tomorrow morning.
  const sameDayHour = now.getHours() + 2;
  const candidates =
    sameDayHour >= 8 && sameDayHour <= 17 ? [at(0, sameDayHour), at(1, 10), at(1, 14)] : [at(1, 8), at(1, 11), at(1, 15)];
  return candidates.map((d, i) => ({ id: `slot_${i}`, start: d.toISOString(), label: slotLabel(d, now) }));
}

// ---- The "AI": deterministic stand-in for the vision + intake agent --------------------------

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function buildSpec(scan: Scan): JobSpec {
  const t = getTemplate(scan.trade);
  const a = scan.answers;
  const idx = (qid: string) => t.questions.find((q) => q.id === qid)?.options.indexOf(a[qid]) ?? -1;
  let severity: number;
  let title: string;
  let summary: string;
  let fields: Record<string, string>;

  if (scan.trade === "mold") {
    severity = 1 + Math.max(0, idx("duration")) + (a.smell === "Yes" ? 1 : 0) + (a.leak === "Yes" ? 1 : 0);
    title = "Visible growth likely";
    summary =
      `Dark patches that look like surface growth. ${a.duration === "Months" ? "Reported as visible for months. " : ""}` +
      `${a.smell === "Yes" ? "A musty smell was reported. " : ""}Testing is recommended to confirm.`;
    fields = {
      likely_moisture_source:
        a.leak === "Yes"
          ? "A recent leak or flooding was reported"
          : scan.skipped.includes("likely_water_source")
            ? "Not clear from the photos"
            : "Possible condensation near a window, pipe or vent",
      recommended_service:
        severity <= 2
          ? "Virtual assessment and surface treatment"
          : severity === 3
            ? "On-site inspection and moisture testing"
            : "On-site testing and a remediation plan",
    };
  } else if (scan.trade !== "plumbing_sink") {
    // The newer trades: severity from how many answers were given past the first option.
    severity = 2 + Object.entries(a).filter(([qid]) => idx(qid) >= 2).length;
    title = scan.description?.split(/[.!?]/)[0]?.trim() || t.title;
    summary = `${scan.description ? `${scan.description.trim()} ` : ""}A pro will confirm on site.`;
    fields = Object.fromEntries(
      t.outputs.filter((k) => k !== "severity" && k !== "affected_area_m2").map((k) => [k, k === "recommended_service" ? "On-site visit" : "See photos"]),
    );
  } else {
    // leak_rate options run from "Slow drip" to "Constant flow".
    severity = 1 + Math.max(0, idx("leak_rate")) + (a.water_off === "No" ? 1 : 0);
    title = "Likely leak at the sink";
    summary = `Moisture is visible around the sink plumbing. ${a.leak_rate ? `Reported as: ${a.leak_rate.toLowerCase()}. ` : ""}A plumber will confirm the source.`;
    fields = {
      leak_location: scan.skipped.includes("faucet_top") ? "Under the sink" : "Under the sink or at the faucet",
      likely_cause: "Loose or worn connection",
      recommended_service: severity <= 2 ? "Leak inspection and minor repair" : "Leak inspection and repair",
    };
  }
  severity = Math.min(5, Math.max(1, severity));

  const notSure = Object.values(a).filter((v) => v === "Not sure").length;
  const confidence = Math.max(
    0.2,
    0.95 - 0.1 * scan.skipped.length - 0.07 * notSure - 0.05 * (retakes.get(scan.id) ?? 0),
  );
  const areaM2 = Math.round((0.3 + 0.45 * severity + (hash(scan.id) % 5) * 0.1) * 10) / 10;

  return {
    id: `spec_${scan.id}`,
    scanId: scan.id,
    trade: scan.trade,
    title,
    summary,
    severity: severity as JobSpec["severity"],
    areaM2,
    confidence: Math.round(confidence * 100) / 100,
    fields: Object.entries(fields).map(([k, value]) => ({ label: t.outputLabels[k] ?? k, value })),
    createdAt: new Date().toISOString(),
  };
}

/** Always a price for the homeowner: the top pro's range, else the middle price across every pro in the trade. */
function estimateFor(spec: JobSpec, options: MatchOption[]): Pick<JobSpec, "price" | "priceBasis"> {
  if (options[0]) return { price: options[0].price, priceBasis: null };
  const ranges = providers
    .filter((p) => p.trades.includes(spec.trade))
    .map((p) => priceRange(p.rateCard, spec.areaM2, spec.severity))
    .sort((a, b) => a.low - b.low);
  const price = ranges[Math.floor(ranges.length / 2)] ?? priceRange({ base: 100, perM2: 15, severityMultiplier: [1, 1.15, 1.4, 1.8, 2.3] }, spec.areaM2, spec.severity);
  return { price, priceBasis: "Based on typical rates for similar jobs in your area." };
}

// ---- Job lifecycle -----------------------------------------------------------------------------

/** Stands in for the provider accepting and driving to the house. Derived from elapsed time. */
function advance(job: Job): Job {
  if (job.status === "collecting") {
    const all = pendingOffers.get(job.id) ?? [];
    const shown = Math.min(all.length, Math.floor((Date.now() - new Date(job.createdAt).getTime()) / mockConfig.offerEveryMs));
    const next = { ...job, offers: all.slice(0, shown).sort((a, b) => a.price - b.price) };
    jobs.set(job.id, next);
    return next;
  }
  if (!simulated.has(job.id) || job.status === "handoff") return job;
  const t = Date.now() - new Date(job.createdAt).getTime();
  const c = mockConfig;
  let next: Job = job;
  if (job.virtual) {
    next = { ...job, status: t >= c.virtualDoneAfterMs ? "done" : t >= c.acceptAfterMs ? "accepted" : "pending" };
  } else if (t >= c.enRouteAfterMs) {
    const eta = c.etaStartMinutes - Math.floor((t - c.enRouteAfterMs) / c.etaStepMs);
    next = eta <= 0 ? { ...job, status: "done", etaMinutes: null } : { ...job, status: "en_route", etaMinutes: eta };
  } else {
    next = { ...job, status: t >= c.acceptAfterMs ? "accepted" : "pending" };
  }
  jobs.set(job.id, next);
  return next;
}

function jobForScan(scanId: string) {
  return [...jobs.values()].find((j) => j.scanId === scanId);
}

// ---- API ---------------------------------------------------------------------------------------

export const mockApi: ScopeApi = {
  restoreSession: async () => signedIn,

  startSignIn: (contact) =>
    call("startSignIn", 400, () => {
      const digits = contact.replace(/\D/g, "");
      if (!contact.includes("@") && digits.length < 7) throw new ApiError("Enter a phone number or an email.", "rejected");
      return { sentTo: contact.includes("@") ? contact : `(•••) •••-${digits.slice(-4)}`, length: DEMO_CODE.length };
    }),

  verifyCode: (contact, code) =>
    call("verifyCode", 500, () => {
      if (code !== DEMO_CODE) throw new ApiError("That code isn't right. Try again.", "rejected");
      if (contact.includes("@")) profile.email = contact;
      else profile.phone = contact;
      setSignedIn(true);
      return { isNew: !profile.name };
    }),

  signOut: async () => setSignedIn(false),

  onSessionChange: (fn) => {
    sessionListeners.add(fn);
    return () => void sessionListeners.delete(fn);
  },

  getProfile: () => call("getProfile", 150, () => ({ ...profile, address: profile.address ?? homes[0].address })),

  updateProfile: ({ lat, lng, ...data }) =>
    call("updateProfile", 300, () => {
      Object.assign(profile, data);
      if (data.address) homes[0] = { ...homes[0], address: data.address, ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}) };
      return { ...profile, address: profile.address ?? homes[0].address };
    }),

  transcribe: () => call("transcribe", 900, () => "There's a leak under my kitchen sink. It drips whenever the tap is on."),

  classify: (text, photoUri) =>
    call("classify", 900, (): Classification => {
      // A photo with no words looks like a sink in the mock, so the camera path has something to show.
      const trade = TRADE_WORDS.find(([, re]) => re.test(text))?.[0] ?? (photoUri ? "plumbing_sink" : "handyman");
      const t = templates.find((x) => x.trade === trade) ?? templates[0];
      const alternatives = ["plumbing_sink", "electrical", "handyman", "mold"]
        .filter((id) => id !== t.trade)
        .slice(0, 2)
        .map((id) => ({ trade: id, label: templates.find((x) => x.trade === id)?.title ?? id }));
      return {
        trade: t.trade,
        label: t.title,
        summary: text.split(/[.!?]/)[0]?.trim().slice(0, 80) || t.blurb,
        alternatives,
        shotId: photoUri ? (t.requiredShots[0]?.id ?? null) : null,
      };
    }),

  reverseGeocode: () => call("reverseGeocode", 400, () => homes[0].address),

  searchAddresses: (query) =>
    call("searchAddresses", 200, () => {
      const q = query.trim().toLowerCase();
      if (q.length < 3) return [];
      return MOCK_ADDRESSES.filter((a) => a.address.toLowerCase().includes(q) || q.split(" ").every((w) => a.address.toLowerCase().includes(w)));
    }),

  listHomes: () => call("listHomes", 150, () => homes),

  listRecord: (homeId) =>
    call("listRecord", 250, () => {
      const items: RecordItem[] = [];
      for (const scan of scans.values()) {
        if (scan.homeId !== homeId) continue;
        const spec = specs.get(`spec_${scan.id}`) ?? [...specs.values()].find((s) => s.scanId === scan.id);
        const job = jobForScan(scan.id);
        const t = getTemplate(scan.trade);
        const firstPhoto = scan.photos.find((p) => p.uri)?.uri ?? null;
        const base = {
          id: scan.id,
          trade: scan.trade,
          title: spec?.title ?? t.title,
          createdAt: scan.createdAt,
          photoUri: firstPhoto,
        };
        if (job) {
          const j = advance(job);
          const status: RecordItem["status"] =
            j.status === "collecting"
              ? j.offers?.length
                ? "offers"
                : "awaiting"
              : j.status === "pending"
                ? "awaiting"
                : j.status === "accepted"
                  ? "scheduled"
                  : j.status === "more_info"
                    ? "needs_info"
                    : j.status;
          const best = j.offers?.[0];
          items.push({
            ...base,
            status,
            price: j.price,
            providerName: j.providerName,
            slot: j.slot,
            slotConfirmed: j.slotConfirmed ?? j.status !== "collecting",
            rating: j.rating,
            href: j.status === "collecting" ? (j.offers?.length ? `/quotes/${j.id}` : `/finding/${j.id}`) : `/booking/${j.id}`,
            offerCount: j.offers?.length ?? 0,
            bestOffer: best ? { price: best.price, provider: best.provider.name } : null,
          });
        } else if (scan.followUp && scan.pendingShotIds.length) {
          items.push({ ...base, status: "needs_info", price: null, href: `/scan/${scan.id}`, followUp: scan.followUp });
        } else {
          const answered = Object.keys(scan.answers).length > 0 && scan.pendingShotIds.length === 0;
          items.push({ ...base, status: "in_progress", price: null, href: answered ? `/book/${scan.id}` : `/scan/${scan.id}` });
        }
      }
      return items.sort((a, b) => {
        const rank = (i: RecordItem) => (i.status === "needs_info" ? 0 : 1);
        return rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt);
      });
    }),

  createScan: (homeId, trade: TradeId, description) =>
    call("createScan", 250, () => {
      const t = getTemplate(trade);
      const scan: Scan = {
        id: id("scan"),
        homeId,
        trade,
        photos: [],
        skipped: [],
        pendingShotIds: t.requiredShots.map((s) => s.id),
        answers: {},
        note: "",
        description: description ?? null,
        createdAt: new Date().toISOString(),
      };
      scans.set(scan.id, scan);
      return scan;
    }),

  getScan: (scanId) => call("getScan", 120, () => structuredClone(need(scans.get(scanId), "Scan"))),

  submitPhoto: (scanId, shotId, uri) =>
    call("submitPhoto", 1100, (): PhotoVerdict => {
      const scan = need(scans.get(scanId), "Scan");
      const key = `${scanId}:${shotId}`;
      const n = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, n);
      if (mockConfig.rejectFirstCloseup && shotId.includes("closeup") && n === 1) {
        retakes.set(scanId, (retakes.get(scanId) ?? 0) + 1);
        return { ok: false, reason: "blurry", message: "That one's a little blurry. Hold steady and tap again." };
      }
      scan.photos = [...scan.photos.filter((p) => p.shotId !== shotId), { shotId, uri, ok: true }];
      scan.pendingShotIds = scan.pendingShotIds.filter((s) => s !== shotId);
      outcomes.delete(scanId);
      return { ok: true, message: "Got it.", pendingShotIds: [...scan.pendingShotIds] };
    }),

  skipShot: (scanId, shotId) =>
    call("skipShot", 120, () => {
      const scan = need(scans.get(scanId), "Scan");
      scan.skipped = [...new Set([...scan.skipped, shotId])];
      scan.pendingShotIds = scan.pendingShotIds.filter((s) => s !== shotId);
      outcomes.delete(scanId);
      return structuredClone(scan);
    }),

  describeInstead: (scanId, description) =>
    call("describeInstead", 200, () => {
      const scan = need(scans.get(scanId), "Scan");
      scan.skipped = [...scan.pendingShotIds];
      scan.pendingShotIds = [];
      scan.description = [scan.description, description.trim()].filter(Boolean).join("\n\n");
      outcomes.delete(scanId);
      return structuredClone(scan);
    }),

  markPhoto: (scanId, shotId, x, y) =>
    call("markPhoto", 200, () => {
      const scan = need(scans.get(scanId), "Scan");
      scan.mark = { shotId, x, y };
      return structuredClone(scan);
    }),

  // The mock has no questions agent: the template's questions, or just the ones a pro asked for.
  getQuestions: (scanId) =>
    call("getQuestions", 700, () => {
      const scan = need(scans.get(scanId), "Scan");
      const ids = scan.followUp?.questionIds;
      return getTemplate(scan.trade).questions.filter((q) => !scan.followUp || ids?.includes(q.id));
    }),

  submitAnswers: (scanId, answers, note) =>
    call("submitAnswers", 300, () => {
      const scan = need(scans.get(scanId), "Scan");
      scan.answers = answers;
      scan.note = note;
      outcomes.delete(scanId);
      return structuredClone(scan);
    }),

  getSpecOutcome: (scanId) =>
    call("getSpecOutcome", 2600, (): SpecOutcome => {
      const cached = outcomes.get(scanId);
      if (cached) return cached;
      const scan = need(scans.get(scanId), "Scan");
      const home = need(homes.find((h) => h.id === scan.homeId), "Home");
      const spec = buildSpec(scan);
      const options = matchProviders(providers, home, spec, makeSlots());
      Object.assign(spec, estimateFor(spec, options));
      specs.set(spec.id, spec);

      let outcome: SpecOutcome;
      if (spec.confidence < 0.6) {
        outcome = { kind: "handoff", spec };
        if (!jobForScan(scanId)) {
          const job: Job = {
            id: id("job"),
            ...jobBase(scanId, spec.id),
            providerName: scan.trade === "mold" ? "Mold Busters" : "Scope",
            providerRating: null,
            status: "handoff",
            slot: null,
            price: spec.price ?? null,
            etaMinutes: null,
            rating: null,
            createdAt: new Date().toISOString(),
            virtual: false,
          };
          jobs.set(job.id, job);
        }
      } else {
        outcome = options.length ? { kind: "match", spec, options } : { kind: "no_provider", spec };
      }
      outcomes.set(scanId, outcome);
      return outcome;
    }),

  getSpec: (specId) => call("getSpec", 120, () => need(specs.get(specId), "Spec")),

  requestOffers: (scanId, slotStart) =>
    call("requestOffers", 700, () => {
      const existing = jobForScan(scanId);
      if (existing) return existing;
      const outcome = outcomes.get(scanId);
      if (outcome?.kind !== "match") throw new ApiError("This estimate is no longer available.", "rejected");
      const spec = outcome.spec;
      const job: Job = {
        id: id("job"),
        ...jobBase(scanId, spec.id),
        providerName: "Pros nearby",
        providerRating: null,
        status: "collecting",
        slot: slotStart ? windowSlot(slotStart) : null,
        slotConfirmed: false,
        price: null,
        etaMinutes: null,
        rating: null,
        createdAt: new Date().toISOString(),
        virtual: false,
        offers: [],
        invitedCount: outcome.options.length,
        passedCount: 0,
      };
      // Each pro prices off its own rate card, nudged a little so offers differ.
      pendingOffers.set(
        job.id,
        outcome.options.map((o, i) => {
          const range = priceRange(need(providers.find((p) => p.id === o.provider.id), "Provider").rateCard, spec.areaM2, spec.severity);
          const mid = (range.low + range.high) / 2;
          return {
            id: `${job.id}_offer_${i}`,
            provider: o.provider,
            distanceKm: o.distanceKm,
            price: Math.round((mid * (0.9 + ((hash(o.provider.id) % 21) / 100))) / 5) * 5,
            slot: slotStart ? windowSlot(slotStart) : o.slots[(i + 1) % o.slots.length],
          };
        }),
      );
      jobs.set(job.id, job);
      return job;
    }),

  acceptOffer: (jobId, offerId) =>
    call("acceptOffer", 700, () => {
      const job = advance(need(jobs.get(jobId), "Job"));
      if (job.status !== "collecting") throw new ApiError("This request is no longer open.", "rejected");
      const offer = need(job.offers?.find((o) => o.id === offerId), "Offer");
      // Restart the simulated lifecycle as already accepted.
      const next: Job = {
        ...job,
        status: "accepted",
        providerName: offer.provider.name,
        providerPhone: "555-0100",
        providerRating: offer.provider.rating,
        slot: offer.slot,
        slotConfirmed: true,
        price: { low: offer.price, high: offer.price },
        offers: [],
        createdAt: new Date(Date.now() - mockConfig.acceptAfterMs).toISOString(),
      };
      jobs.set(jobId, next);
      pendingOffers.delete(jobId);
      simulated.add(jobId);
      return next;
    }),

  listVirtualSlots: () => call("listVirtualSlots", 150, makeSlots),

  bookVirtualCall: (scanId, slotId) =>
    call("bookVirtualCall", 900, () => {
      const existing = jobForScan(scanId);
      if (existing) return existing;
      const scan = need(scans.get(scanId), "Scan");
      const outcome = need(outcomes.get(scanId), "Estimate");
      const slot = need(makeSlots().find((s) => s.id === slotId), "Time slot");
      const job: Job = {
        id: id("job"),
        ...jobBase(scanId, outcome.spec.id),
        providerName: scan.trade === "mold" ? "Mold Busters" : "Scope",
        providerRating: null,
        status: "pending",
        slot,
        price: outcome.spec.price ?? null,
        etaMinutes: null,
        rating: null,
        createdAt: new Date().toISOString(),
        virtual: true,
      };
      jobs.set(job.id, job);
      simulated.add(job.id);
      return job;
    }),

  getJob: (jobId) => call("getJob", 120, () => advance(need(jobs.get(jobId), "Job"))),

  askForHuman: (scanId) =>
    call("askForHuman", 600, (): SpecOutcome => {
      const outcome = need(outcomes.get(scanId), "Estimate");
      const scan = need(scans.get(scanId), "Scan");
      if (!jobForScan(scanId)) {
        const jobId = id("job");
        jobs.set(jobId, {
          id: jobId,
          ...jobBase(scanId, outcome.spec.id),
          providerName: scan.trade === "mold" ? "Mold Busters" : "Scope",
          providerRating: null,
          status: "handoff",
          slot: null,
          price: outcome.spec.price ?? null,
          etaMinutes: null,
          rating: null,
          createdAt: new Date().toISOString(),
          virtual: false,
        });
      }
      const next: SpecOutcome = { kind: "handoff", spec: outcome.spec };
      outcomes.set(scanId, next);
      return next;
    }),

  cancelJob: (jobId) =>
    call("cancelJob", 400, () => {
      const job = need(jobs.get(jobId), "Job");
      if (!["collecting", "pending", "accepted", "handoff", "more_info", "declined"].includes(job.status)) {
        throw new ApiError("This job can't be cancelled now. Contact the pro.", "rejected");
      }
      const next: Job = { ...job, status: "cancelled", offers: [] };
      jobs.set(jobId, next);
      simulated.delete(jobId);
      pendingOffers.delete(jobId);
      return next;
    }),

  rateJob: (jobId, review) =>
    call("rateJob", 500, () => {
      const job = need(jobs.get(jobId), "Job");
      const next = { ...job, rating: review.stars };
      jobs.set(jobId, next);
      return next;
    }),
};
