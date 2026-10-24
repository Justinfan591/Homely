import { matchProviders } from "@/domain/matching";
import { priceRange } from "@/domain/pricing";
import { slotLabel } from "@/domain/format";
import type {
  Job,
  JobSpec,
  PhotoVerdict,
  RecordItem,
  Scan,
  Slot,
  SpecOutcome,
  TradeId,
} from "@/domain/types";
import { getTemplate } from "@/templates";
import { ApiError, type ScopeApi } from "../api";
import { homes, providers, seedJobs, seedScans, seedSpecs } from "./seed";

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
let counter = 100;

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

// ---- Job lifecycle -----------------------------------------------------------------------------

/** Stands in for the provider accepting and driving to the house. Derived from elapsed time. */
function advance(job: Job): Job {
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
            j.status === "pending" ? "awaiting" : j.status === "accepted" ? "scheduled" : j.status === "more_info" ? "needs_info" : j.status;
          items.push({ ...base, status, price: j.price, href: `/track/${j.id}` });
        } else if (scan.followUp && scan.pendingShotIds.length) {
          items.push({ ...base, status: "needs_info", price: null, href: `/scan/${scan.id}`, followUp: scan.followUp });
        } else {
          const answered = Object.keys(scan.answers).length > 0 && scan.pendingShotIds.length === 0;
          items.push({ ...base, status: "in_progress", price: null, href: answered ? `/spec/${scan.id}` : `/scan/${scan.id}` });
        }
      }
      return items.sort((a, b) => {
        const rank = (i: RecordItem) => (i.status === "needs_info" ? 0 : 1);
        return rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt);
      });
    }),

  createScan: (homeId, trade: TradeId) =>
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
      return { ok: true, message: "Got it." };
    }),

  skipShot: (scanId, shotId) =>
    call("skipShot", 120, () => {
      const scan = need(scans.get(scanId), "Scan");
      scan.skipped = [...new Set([...scan.skipped, shotId])];
      scan.pendingShotIds = scan.pendingShotIds.filter((s) => s !== shotId);
      outcomes.delete(scanId);
      return structuredClone(scan);
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
      specs.set(spec.id, spec);

      let outcome: SpecOutcome;
      if (spec.confidence < 0.6) {
        outcome = { kind: "handoff", spec };
        if (!jobForScan(scanId)) {
          const job: Job = {
            id: id("job"),
            specId: spec.id,
            scanId,
            homeId: home.id,
            providerName: scan.trade === "mold" ? "Mold Busters" : "Scope",
            providerRating: null,
            status: "handoff",
            slot: null,
            price: null,
            etaMinutes: null,
            rating: null,
            createdAt: new Date().toISOString(),
            virtual: false,
          };
          jobs.set(job.id, job);
        }
      } else {
        const options = matchProviders(providers, home, spec, makeSlots());
        outcome = options.length ? { kind: "match", spec, options } : { kind: "no_provider", spec };
      }
      outcomes.set(scanId, outcome);
      return outcome;
    }),

  getSpec: (specId) => call("getSpec", 120, () => need(specs.get(specId), "Spec")),

  bookJob: (scanId, providerId, slotId) =>
    call("bookJob", 900, () => {
      const existing = jobForScan(scanId);
      if (existing) return existing;
      const outcome = outcomes.get(scanId);
      if (outcome?.kind !== "match") throw new ApiError("This estimate is no longer available.", "rejected");
      const option = need(outcome.options.find((o) => o.provider.id === providerId), "Provider");
      const slot = need(option.slots.find((s) => s.id === slotId), "Time slot");
      const job: Job = {
        id: id("job"),
        specId: outcome.spec.id,
        scanId,
        homeId: scans.get(scanId)!.homeId,
        providerName: option.provider.name,
        providerRating: option.provider.rating,
        status: "pending",
        slot,
        price: priceRange(need(providers.find((p) => p.id === option.provider.id), "Provider").rateCard, outcome.spec.areaM2, outcome.spec.severity),
        etaMinutes: null,
        rating: null,
        createdAt: new Date().toISOString(),
        virtual: false,
      };
      jobs.set(job.id, job);
      simulated.add(job.id);
      return job;
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
        specId: outcome.spec.id,
        scanId,
        homeId: scan.homeId,
        providerName: scan.trade === "mold" ? "Mold Busters" : "Scope",
        providerRating: null,
        status: "pending",
        slot,
        price: null,
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
          specId: outcome.spec.id,
          scanId,
          homeId: scan.homeId,
          providerName: scan.trade === "mold" ? "Mold Busters" : "Scope",
          providerRating: null,
          status: "handoff",
          slot: null,
          price: null,
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
      if (!["pending", "handoff", "more_info", "declined"].includes(job.status)) {
        throw new ApiError("This job can't be cancelled now. Contact the pro.", "rejected");
      }
      const next: Job = { ...job, status: "cancelled" };
      jobs.set(jobId, next);
      simulated.delete(jobId);
      return next;
    }),

  rateJob: (jobId, stars) =>
    call("rateJob", 500, () => {
      const job = need(jobs.get(jobId), "Job");
      const next = { ...job, rating: stars };
      jobs.set(jobId, next);
      return next;
    }),
};
