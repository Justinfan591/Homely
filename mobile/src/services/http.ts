// ScopeApi over HTTP: the real backend (Next.js API in the repo root) via the shared typed client.
// No React Native imports, so scripts/e2e.ts can drive it from Node. Relative imports for the same reason.
import { createScopeClient, ScopeApiError, type PhotoInput } from "../../../shared/scope-client";
import type { HomeRecordItem, ProviderMatch, ScanResponse, ScopeJobStatus, Slot as ApiSlot } from "../../../shared/scope";
import { slotLabel } from "../domain/format";
import type { Job, JobSpec, JobStatus, MatchOption, RecordItem, RecordStatus, Scan, Slot, SpecOutcome } from "../domain/types";
import { ApiError, type ScopeApi } from "./api";

export type HttpApiOptions = {
  baseUrl: string;
  /** Turns a local image uri into an upload part (resized JPEG on the phone, a Blob in tests). */
  preparePhoto: (uri: string) => Promise<PhotoInput>;
  /** The live demo has no sign-in screen: the app signs in as the demo homeowner. */
  account?: { email: string; password: string };
  fetch?: typeof fetch;
};

export const DEMO_HOMEOWNER = { email: "customer@demo.com", password: "password123" };

export function createHttpApi(opts: HttpApiOptions): ScopeApi {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const account = opts.account ?? DEMO_HOMEOWNER;
  let token: string | null = null;
  const client = createScopeClient({ baseUrl: base, getToken: () => token, fetch: opts.fetch });
  const h = client.homeowner;
  // Answers wait here until the spec screen generates the estimate (keeps the "analyzing" step there).
  const pending = new Map<string, { answers: Record<string, string>; note: string }>();
  const specScan = new Map<string, string>();

  /** Signs in on first use and once more if the token expires; maps errors to ApiError. */
  async function run<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        if (!token) token = (await client.auth.login(account.email, account.password)).token;
        return await fn();
      } catch (err) {
        if (err instanceof ScopeApiError) {
          if (err.status === 401 && attempt === 0) {
            token = null;
            continue;
          }
          throw new ApiError(err.message, err.status === 404 ? "not_found" : err.status >= 500 ? "network" : "rejected");
        }
        if (err instanceof ApiError) throw err;
        throw new ApiError(`We couldn't reach Scope at ${base}. Is the server running, and is your phone on the same Wi-Fi?`);
      }
    }
  }

  const abs = (src: string) => `${base}${src}`;
  const slot = (s: ApiSlot | string): Slot => {
    const start = typeof s === "string" ? s : s.startsAt;
    // The id is the start time, so booking can send it straight back.
    return { id: start, start, label: slotLabel(new Date(start)) };
  };

  function toScan(r: ScanResponse): Scan {
    const best = new Map<string, string>();
    for (const p of r.photos) if (p.ok) best.set(p.shotId, abs(p.src));
    const focus = r.scan.focus;
    return {
      id: String(r.scan.id),
      homeId: String(r.home.id),
      trade: r.scan.trade,
      photos: [...best].map(([shotId, uri]) => ({ shotId, uri, ok: true })),
      skipped: r.scan.skippedShots,
      pendingShotIds: r.remainingShots,
      answers: r.scan.answers,
      note: r.scan.notes ?? "",
      createdAt: r.scan.createdAt,
      followUp: focus ? { provider: r.job?.provider?.name ?? "Your pro", message: focus.message ?? "", questionIds: focus.questionIds } : undefined,
    };
  }

  function toSpec(r: ScanResponse): JobSpec {
    const s = r.spec;
    if (!s) throw new ApiError("Finish the photos and questions first.", "rejected");
    specScan.set(String(s.id), String(r.scan.id));
    return {
      id: String(s.id),
      scanId: String(r.scan.id),
      trade: s.trade,
      title: s.title,
      summary: s.summary,
      severity: Math.min(5, Math.max(1, Math.round(s.severity))) as JobSpec["severity"],
      areaM2: s.areaM2,
      confidence: s.confidence,
      fields: Object.entries(s.fields).map(([k, value]) => ({ label: r.template.output_labels[k] ?? k, value })),
      createdAt: s.createdAt,
    };
  }

  const toOption = (m: ProviderMatch): MatchOption => ({
    provider: { id: String(m.id), name: m.name, rating: m.rating, reviews: m.ratingCount, etaMinutes: m.etaMinutes },
    distanceKm: m.distanceKm,
    price: { low: m.quote.low, high: m.quote.high },
    slots: m.slots.map(slot),
  });

  const JOB_STATUS: Record<ScopeJobStatus, JobStatus> = {
    pending: "pending",
    virtual_call: "pending",
    handoff: "handoff",
    more_info: "more_info",
    accepted: "accepted",
    en_route: "en_route",
    done: "done",
    declined: "declined",
    cancelled: "cancelled",
  };

  function toJob(r: ScanResponse): Job {
    const j = r.job;
    if (!j) throw new ApiError("This scan hasn't been sent to a pro yet.", "not_found");
    const virtual = j.mode === "virtual";
    const when = j.slot ?? j.requestedSlot;
    const price = j.price != null ? { low: j.price, high: j.price } : r.spec?.priceLow != null && r.spec.priceHigh != null ? { low: r.spec.priceLow, high: r.spec.priceHigh } : null;
    return {
      // One job per scan, so the scan id doubles as the job id.
      id: String(r.scan.id),
      specId: String(r.spec?.id ?? ""),
      scanId: String(r.scan.id),
      homeId: String(r.home.id),
      providerName: j.provider?.name ?? (virtual ? "Our virtual team" : "A Scope specialist"),
      providerRating: j.provider?.rating ?? null,
      status: JOB_STATUS[j.status],
      slot: when ? slot(when) : null,
      slotConfirmed: !!j.slot,
      price,
      etaMinutes: j.status === "en_route" && j.eta ? Math.max(0, Math.round((new Date(j.eta).getTime() - Date.now()) / 60000)) : null,
      rating: j.rating,
      createdAt: j.createdAt,
      virtual,
      followUp: j.status === "more_info" && j.request ? { provider: j.provider?.name ?? "Your pro", message: j.request.message ?? "", questionIds: j.request.questionIds } : undefined,
    };
  }

  function toOutcome(r: ScanResponse): SpecOutcome {
    const spec = toSpec(r);
    const job = r.job;
    if (job?.status === "handoff") return { kind: "handoff", spec };
    if (job && job.status !== "declined") return { kind: "submitted", spec, jobId: String(r.scan.id) };
    // Choosing a pro: first time, or again after a decline (the decliner is already excluded).
    return r.matches.length ? { kind: "match", spec, options: r.matches.map(toOption) } : { kind: "no_provider", spec };
  }

  function recordStatus(i: HomeRecordItem): { status: RecordStatus; href: string } {
    const id = i.scanId;
    switch (i.jobStatus) {
      case null:
        if (i.scanStatus === "cancelled") return { status: "cancelled", href: `/scan/${id}` };
        return { status: "in_progress", href: i.scanStatus === "clarifying" ? `/clarify/${id}` : i.scanStatus === "spec_ready" ? `/spec/${id}` : `/scan/${id}` };
      case "more_info":
        return { status: "needs_info", href: `/scan/${id}` };
      case "pending":
      case "virtual_call":
        return { status: "awaiting", href: `/track/${id}` };
      case "accepted":
        return { status: "scheduled", href: `/track/${id}` };
      default:
        return { status: i.jobStatus, href: `/track/${id}` };
    }
  }

  const scan = (scanId: string) => h.scan(Number(scanId));

  return {
    listHomes: () =>
      run(async () => {
        const { home } = await h.home();
        return home ? [{ id: String(home.id), name: home.label, address: home.address, lat: home.lat, lng: home.lng }] : [];
      }),

    listRecord: () =>
      run(async () =>
        (await h.home()).record.map((i): RecordItem => {
          const { status, href } = recordStatus(i);
          return {
            id: String(i.scanId),
            trade: i.trade,
            title: i.title,
            createdAt: i.updatedAt,
            status,
            price: i.price != null ? { low: i.price, high: i.price } : i.priceLow != null && i.priceHigh != null ? { low: i.priceLow, high: i.priceHigh } : null,
            photoUri: i.photoSrc ? abs(i.photoSrc) : null,
            href,
            followUp: i.request ? { provider: i.providerName ?? "Your pro", message: i.request.message ?? "", questionIds: i.request.questionIds } : undefined,
          };
        }),
      ),

    createScan: (_homeId, trade) =>
      run(async () => {
        const { id } = await h.startScan(trade);
        return toScan(await h.scan(id));
      }),

    // Opening a scan the pro asked more about reopens it for just those items.
    getScan: (scanId) =>
      run(async () => {
        let r = await scan(scanId);
        if (r.job?.status === "more_info" && r.scan.status === "submitted") r = await h.reopen(r.scan.id);
        return toScan(r);
      }),

    submitPhoto: (scanId, shotId, uri) =>
      run(async () => {
        const res = await h.uploadShot(Number(scanId), shotId, await opts.preparePhoto(uri), "photo.jpg");
        return res.ok ? { ok: true, message: res.message } : { ok: false, reason: "wrong_subject", message: res.message };
      }),

    skipShot: (scanId, shotId) =>
      run(async () => {
        await h.skipShot(Number(scanId), shotId);
        return toScan(await scan(scanId));
      }),

    submitAnswers: (scanId, answers, note) =>
      run(async () => {
        pending.set(scanId, { answers, note });
        return toScan(await scan(scanId));
      }),

    getSpecOutcome: (scanId) =>
      run(async () => {
        let r = await scan(scanId);
        if (r.scan.status === "clarifying") {
          const p = pending.get(scanId) ?? { answers: {}, note: "" };
          r = await h.finish(r.scan.id, p.answers, p.note || null);
          pending.delete(scanId);
        }
        return toOutcome(r);
      }),

    getSpec: (specId) =>
      run(async () => {
        const scanId = specScan.get(specId);
        if (!scanId) throw new ApiError("Spec not found", "not_found");
        return toSpec(await scan(scanId));
      }),

    bookJob: (scanId, providerId, slotId) => run(async () => toJob(await h.book(Number(scanId), Number(providerId), slotId))),

    bookVirtualCall: (scanId, slotId) => run(async () => toJob(await h.requestVirtualCall(Number(scanId), slotId))),

    listVirtualSlots: () => run(async () => (await h.slots()).slots.map(slot)),

    getJob: (jobId) => run(async () => toJob(await scan(jobId))),

    rateJob: (jobId, stars) => run(async () => toJob(await h.rate(Number(jobId), Math.min(5, Math.max(1, Math.round(stars))) as 1 | 2 | 3 | 4 | 5))),

    askForHuman: (scanId) => run(async () => toOutcome(await h.askForHuman(Number(scanId)))),

    cancelJob: (jobId) => run(async () => toJob(await h.cancel(Number(jobId)))),
  };
}
