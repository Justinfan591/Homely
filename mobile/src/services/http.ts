// ScopeApi over HTTP: the real backend (Next.js API in the repo root) via the shared typed client.
// No React Native imports, so scripts/e2e.ts can drive it from Node. Relative imports for the same reason.
import { createScopeClient, ScopeApiError, type PhotoInput } from "../../../shared/scope-client";
import type { HomeRecordItem, OfferInfo, ProviderMatch, ScanResponse, ScopeJobStatus, Slot as ApiSlot } from "../../../shared/scope";
import { slotLabel } from "../domain/format";
import type { Job, JobSpec, JobStatus, MatchOption, Offer, Profile, RecordItem, RecordStatus, Scan, Slot, SpecOutcome } from "../domain/types";
import { ApiError, type ScopeApi } from "./api";

/** Where the app keeps its session token (SecureStore on the phone). */
export type TokenStore = { get(): Promise<string | null>; set(token: string | null): Promise<void> };

export type HttpApiOptions = {
  baseUrl: string;
  /** Turns a local image uri into an upload part (resized JPEG on the phone, a Blob in tests). */
  preparePhoto: (uri: string) => Promise<PhotoInput>;
  /** Turns a local recording uri into an upload part. */
  prepareAudio?: (uri: string) => Promise<PhotoInput>;
  /**
   * The app signs in with a code and keeps the token here. Without a store (scripts/e2e.ts),
   * the client signs in as `account`, the demo homeowner by default.
   */
  session?: TokenStore;
  account?: { email: string; password: string };
  fetch?: typeof fetch;
};

export const DEMO_HOMEOWNER = { email: "customer@demo.com", password: "password123" };

export function createHttpApi(opts: HttpApiOptions): ScopeApi {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const account = opts.account ?? DEMO_HOMEOWNER;
  let token: string | null = null;
  let restored = false;
  const listeners = new Set<(signedIn: boolean) => void>();
  const client = createScopeClient({ baseUrl: base, getToken: () => token, fetch: opts.fetch });
  const h = client.homeowner;

  async function setToken(next: string | null) {
    const changed = !!next !== !!token;
    token = next;
    await opts.session?.set(next).catch((err) => console.warn("Couldn't save the session", err));
    if (changed) for (const fn of listeners) fn(!!next);
  }

  /** The app's code sign-in (a saved token), or the demo password sign-in for scripts. */
  async function ensureToken() {
    if (token) return;
    if (opts.session) {
      if (!restored) {
        restored = true;
        token = await opts.session.get().catch(() => null);
      }
      if (!token) throw new ApiError("Please sign in.", "signed_out");
    } else {
      token = (await client.auth.login(account.email, account.password)).token;
    }
  }
  // Answers wait here until the spec screen generates the estimate (keeps the "analyzing" step there).
  const pending = new Map<string, { answers: Record<string, string>; note: string }>();
  const specScan = new Map<string, string>();

  /** Signs in on first use and once more if the token expires; maps errors to ApiError. */
  async function run<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        await ensureToken();
        return await fn();
      } catch (err) {
        if (err instanceof ScopeApiError) {
          if (err.status === 401 && opts.session) {
            await setToken(null);
            throw new ApiError("Please sign in again.", "signed_out");
          }
          if (err.status === 401 && attempt === 0) {
            token = null;
            continue;
          }
          throw new ApiError(err.message, err.status === 404 ? "not_found" : err.status >= 500 ? "network" : "rejected");
        }
        if (err instanceof ApiError) throw err;
        // Shows in the `npx expo start` terminal, so a code bug isn't mistaken for a network problem.
        console.warn(`Scope request to ${base} failed:`, err);
        const why = err instanceof Error ? ` (${err.message})` : "";
        throw new ApiError(`We couldn't reach Scope at ${base}${why}. Is the server running, and is your phone on the same Wi-Fi?`);
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
      description: r.scan.description,
      mark: r.scan.mark,
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

  const toOffer = (o: OfferInfo): Offer => ({
    id: String(o.id),
    provider: { id: String(o.provider.id), name: o.provider.name, rating: o.provider.rating, reviews: o.provider.ratingCount, etaMinutes: o.etaMinutes },
    distanceKm: o.distanceKm,
    price: o.price,
    slot: slot(o.slot),
  });

  const JOB_STATUS: Record<ScopeJobStatus, JobStatus> = {
    open: "collecting",
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
      trade: r.scan.trade,
      title: r.spec?.title ?? r.template.label,
      address: r.home.address,
      providerPhone: j.provider?.phone ?? null,
      providerName: j.provider?.name ?? (virtual ? "Our virtual team" : j.status === "open" ? "Pros nearby" : j.status === "more_info" ? "A pro" : "A Scope specialist"),
      providerRating: j.provider?.rating ?? null,
      status: JOB_STATUS[j.status],
      slot: when ? slot(when) : null,
      slotConfirmed: !!j.slot,
      price,
      etaMinutes: j.status === "en_route" && j.eta ? Math.max(0, Math.round((new Date(j.eta).getTime() - Date.now()) / 60000)) : null,
      rating: j.rating,
      createdAt: j.createdAt,
      virtual,
      followUp: j.status === "more_info" && j.request ? { provider: j.provider?.name ?? "A pro", message: j.request.message ?? "", questionIds: j.request.questionIds } : undefined,
      offers: r.offers.map(toOffer),
      invitedCount: r.invitedCount,
      passedCount: r.passedCount,
    };
  }

  function toOutcome(r: ScanResponse): SpecOutcome {
    const spec = toSpec(r);
    const job = r.job;
    if (job?.status === "handoff") return { kind: "handoff", spec };
    // Every pro passed on the open request: offer the virtual call.
    if (job?.status === "open" && r.invitedCount > 0 && r.passedCount >= r.invitedCount) return { kind: "no_provider", spec };
    if (job && job.status !== "declined") return { kind: "submitted", spec, jobId: String(r.scan.id) };
    // Ready to request offers: first time, or again after a decline (the decliner is already excluded).
    return r.matches.length ? { kind: "match", spec, options: r.matches.map(toOption) } : { kind: "no_provider", spec };
  }

  /** Status for the Home Record, and the screen that picks up from there. */
  function recordStatus(i: HomeRecordItem): { status: RecordStatus; href: string } {
    const id = i.scanId;
    switch (i.jobStatus) {
      case null:
        if (i.scanStatus === "cancelled") return { status: "cancelled", href: `/booking/${id}` };
        return { status: "in_progress", href: i.scanStatus === "clarifying" ? `/questions/${id}` : i.scanStatus === "spec_ready" ? `/book/${id}` : `/scan/${id}` };
      case "more_info":
        return { status: "needs_info", href: `/scan/${id}` };
      case "open":
        return { status: i.offerCount ? "offers" : "awaiting", href: i.offerCount ? `/quotes/${id}` : `/finding/${id}` };
      case "pending":
      case "virtual_call":
        return { status: "awaiting", href: `/booking/${id}` };
      case "accepted":
        return { status: "scheduled", href: `/booking/${id}` };
      default:
        return { status: i.jobStatus, href: `/booking/${id}` };
    }
  }

  const scan = (scanId: string) => h.scan(Number(scanId));

  return {
    restoreSession: async () => {
      if (!opts.session) return true;
      try {
        await ensureToken();
        // Check the saved token still works (e.g. the server's secret changed).
        await client.auth.me();
        return true;
      } catch (err) {
        if (err instanceof ScopeApiError && err.status === 401) await setToken(null);
        // Offline: keep the token and let screens show their retry state.
        return !!token;
      }
    },

    startSignIn: (contact) =>
      client.auth.startCode(contact).catch((err) => {
        throw toApiError(err);
      }),

    verifyCode: async (contact, code) => {
      try {
        const res = await client.auth.verifyCode(contact, code);
        await setToken(res.token);
        return { isNew: res.isNew };
      } catch (err) {
        throw toApiError(err);
      }
    },

    signOut: () => setToken(null),

    onSessionChange: (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },

    getProfile: () => run(async (): Promise<Profile> => ({ ...(await h.profile()) })),

    updateProfile: (data) => run(async (): Promise<Profile> => ({ ...(await h.updateProfile(data)) })),

    transcribe: (audioUri) =>
      run(async () => {
        if (!opts.prepareAudio) throw new ApiError("Voice isn't available here.", "rejected");
        return (await h.transcribe(await opts.prepareAudio(audioUri), "recording.m4a")).text;
      }),

    classify: (text, photoUri) => run(async () => h.classify(text, photoUri ? await opts.preparePhoto(photoUri) : null)),

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
            providerName: i.providerName,
            slot: i.slot ? slot(i.slot) : null,
            slotConfirmed: i.slotConfirmed,
            rating: i.rating,
            createdAt: i.updatedAt,
            status,
            price: i.price != null ? { low: i.price, high: i.price } : i.priceLow != null && i.priceHigh != null ? { low: i.priceLow, high: i.priceHigh } : null,
            photoUri: i.photoSrc ? abs(i.photoSrc) : null,
            href,
            followUp: i.request ? { provider: i.providerName ?? "Your pro", message: i.request.message ?? "", questionIds: i.request.questionIds } : undefined,
            offerCount: i.offerCount,
            bestOffer: i.bestOffer ? { price: i.bestOffer.price, provider: i.bestOffer.providerName } : null,
          };
        }),
      ),

    createScan: (_homeId, trade, description) =>
      run(async () => {
        const { id } = await h.startScan(trade, description);
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

    describeInstead: (scanId, description) => run(async () => toScan(await h.describeInstead(Number(scanId), description))),

    markPhoto: (scanId, shotId, x, y) => run(async () => toScan(await h.mark(Number(scanId), { shotId, x, y }))),

    submitAnswers: (scanId, answers, note) =>
      run(async () => {
        pending.set(scanId, { answers, note });
        return toScan(await scan(scanId));
      }),

    getSpecOutcome: (scanId) =>
      run(async () => {
        let r = await scan(scanId);
        if (r.scan.status === "clarifying") {
          const p = pending.get(scanId);
          // Answers only live in memory until the estimate is made; after an app restart they're gone.
          const asked = r.template.questions.filter((q) => !r.scan.focus || r.scan.focus.questionIds.includes(q.id));
          if (!p && asked.some((q) => !q.optional)) throw new ApiError("Please answer the questions again.", "needs_answers");
          r = await h.finish(r.scan.id, p?.answers ?? {}, p?.note || null);
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

    requestOffers: (scanId, slotStart) => run(async () => toJob(await h.requestOffers(Number(scanId), slotStart))),

    acceptOffer: (jobId, offerId) => run(async () => toJob(await h.acceptOffer(Number(jobId), Number(offerId)))),

    bookVirtualCall: (scanId, slotId) => run(async () => toJob(await h.requestVirtualCall(Number(scanId), slotId))),

    listVirtualSlots: () => run(async () => (await h.slots()).slots.map(slot)),

    getJob: (jobId) => run(async () => toJob(await scan(jobId))),

    rateJob: (jobId, review) =>
      run(async () => {
        const stars = Math.min(5, Math.max(1, Math.round(review.stars))) as 1 | 2 | 3 | 4 | 5;
        return toJob(await h.rate(Number(jobId), stars, { tags: review.tags, note: review.note.trim() || null }));
      }),

    askForHuman: (scanId) => run(async () => toOutcome(await h.askForHuman(Number(scanId)))),

    cancelJob: (jobId) => run(async () => toJob(await h.cancel(Number(jobId)))),
  };
}

/** Sign-in calls run before there is a session, so they map errors themselves. */
function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof ScopeApiError) return new ApiError(err.message, err.status === 404 ? "not_found" : err.status >= 500 ? "network" : "rejected");
  console.warn("Scope sign-in request failed:", err);
  return new ApiError("We couldn't reach Scope. Is the server running, and is your phone on the same Wi-Fi?");
}
