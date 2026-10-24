// Typed client for the Scope API: every homeowner and /pro endpoint, one function each.
// No dependencies; works in the browser, React Native and Node 18+.
//
//   const api = createScopeClient({ baseUrl: "http://192.168.1.20:3000", getToken: () => localStorage.getItem("token") });
//   const { token } = await api.auth.login("customer@demo.com", "password123");
//   const { id } = await api.homeowner.startScan("mold");
//   const pro = api.pro(1); // Mold Busters
//   const { tabs } = await pro.queue();
//
// Errors throw ScopeApiError with the server's message (safe to show to users) and HTTP status.
import type {
  HomeInfo,
  HomeResponse,
  MoreInfoRequest,
  ProJobDetail,
  ProProvider,
  ProQueueResponse,
  ProfilePricing,
  ProfileView,
  ScanPhotoInfo,
  ScanResponse,
  ShotResult,
  Slot,
  TemplateSummary,
} from "./scope";

export type ProfileAction =
  | { action: "start" | "retry" | "skip" }
  | { action: "answer"; answer: string[]; note?: string | null }
  | { action: "pricing"; pricing: ProfilePricing }
  | { action: "description"; description: string }
  | { action: "website"; url: string };

export type SessionUser = { id: number; name: string; email: string; role: "customer" | "provider" | "agent" };
export type AuthResponse = { token: string; user: SessionUser };
export type HealthResponse = { ok: true; ai: "claude" | "fake" | "missing_key"; trades: string[] };

/**
 * A photo to upload: a Blob/File in the browser or Node; in React Native, `{ uri, name, type }`
 * with RN's own fetch, or `{ name, type, bytes }` with Expo's fetch (SDK 52+), which can't send uri parts.
 */
export type PhotoInput =
  | Blob
  | { uri: string; name: string; type: string }
  | { name: string; type: string; bytes: () => Promise<Uint8Array> };

export type ScopeClientOptions = {
  /** API server origin, e.g. "http://localhost:3000". Empty when the UI is served by the same Next app. */
  baseUrl?: string;
  /** Homeowner bearer token from auth.login/signup. Not needed for /pro calls. */
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  fetch?: typeof fetch;
};

export class ScopeApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "ScopeApiError";
  }
}

type CallOptions = { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; form?: FormData; provider?: number; auth?: boolean };

export function createScopeClient(options: ScopeClientOptions = {}) {
  const base = (options.baseUrl ?? "").replace(/\/+$/, "");
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function call<T>(path: string, o: CallOptions = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (o.auth !== false) {
      const token = await options.getToken?.();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    let body: BodyInit | undefined;
    if (o.form) body = o.form;
    else if (o.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(o.body);
    }
    const url = `${base}${path}${o.provider ? `${path.includes("?") ? "&" : "?"}provider=${o.provider}` : ""}`;
    const res = await doFetch(url, { method: o.method ?? (body ? "POST" : "GET"), headers, body });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
      throw new ScopeApiError(msg, res.status, data);
    }
    return data as T;
  }

  const scanPath = (id: number, action = "") => `/api/scans/${id}${action ? `/${action}` : ""}`;

  return {
    /** Server up? Which AI ("claude", "fake" or "missing_key")? */
    health: () => call<HealthResponse>("/api/health", { auth: false }),

    /** Absolute URL for a photo's signed `src`, ready for <img src>. */
    photoSrc: (photo: Pick<ScanPhotoInfo, "src">) => `${base}${photo.src}`,

    auth: {
      login: (email: string, password: string) => call<AuthResponse>("/api/auth/login", { body: { email, password }, auth: false }),
      signup: (data: { name: string; email: string; password: string; phone?: string; role?: "customer" | "provider" }) =>
        call<AuthResponse>("/api/auth/signup", { body: { role: "customer", ...data }, auth: false }),
      me: () => call<{ user: SessionUser }>("/api/auth/me"),
    },

    /** Homeowner flow. Needs a customer token (getToken). */
    homeowner: {
      templates: () => call<{ templates: TemplateSummary[] }>("/api/templates"),
      /** Home + Home Record. `home` is null until setHome is called. */
      home: () => call<HomeResponse>("/api/home"),
      setHome: (home: { address: string; lat: number; lng: number; label?: string }) => call<{ home: HomeInfo }>("/api/home", { method: "PUT", body: home }),
      /** "Scan a problem" → returns the new scan id. 409 if the home isn't set. */
      startScan: (trade: string) => call<{ id: number }>("/api/scans", { body: { trade } }),
      /** Everything the scan screens render. Poll every 2 s while tracking. */
      scan: (scanId: number) => call<ScanResponse>(scanPath(scanId)),
      /** Upload one shot; Claude checks it. `ok: false` means retake (show `message`). */
      uploadShot: (scanId: number, shotId: string, photo: PhotoInput, filename = "photo.jpg") => {
        const form = new FormData();
        form.append("shotId", shotId);
        if (typeof Blob !== "undefined" && photo instanceof Blob) form.append("photo", photo, filename);
        else form.append("photo", photo as unknown as Blob); // React Native file object
        return call<ShotResult>(scanPath(scanId, "shots"), { form });
      },
      /** Skip an optional shot (show the shot's `skip_label` as the button). */
      skipShot: (scanId: number, shotId: string) => call<ShotResult>(scanPath(scanId, "skip"), { body: { shotId } }),
      /** Tap answers + optional note → JobSpec. Takes a few seconds with real AI. */
      finish: (scanId: number, answers: Record<string, string>, notes?: string | null) => call<ScanResponse>(scanPath(scanId, "finish"), { body: { answers, notes } }),
      /** "Get offers": sends the spec to every matching pro at once. `slot` is an optional preferred `startsAt`. Poll `scan()` for `offers`. */
      requestOffers: (scanId: number, slot?: string) => call<ScanResponse>(scanPath(scanId, "request"), { body: { slot } }),
      /** Accept one of `offers`: that pro gets the job at that price and time. */
      acceptOffer: (scanId: number, offerId: number) => call<ScanResponse>(`${scanPath(scanId, "offers")}/${offerId}/accept`, { method: "POST" }),
      /** No pro in range (or all passed): virtual call with the trade's partner, optionally at a requested `slot`. */
      requestVirtualCall: (scanId: number, slot?: string) => call<ScanResponse>(scanPath(scanId, "virtual-call"), { body: { slot } }),
      /** Bookable times (for a virtual call when there are no `matches`). */
      slots: () => call<{ slots: Slot[] }>("/api/slots"),
      /** "I'd rather talk to a person": handoff to human review. */
      askForHuman: (scanId: number) => call<ScanResponse>(scanPath(scanId, "human"), { method: "POST" }),
      /** The pro asked for more (job.status "more_info"): reopen capture for just those items. */
      reopen: (scanId: number) => call<ScanResponse>(scanPath(scanId, "reopen"), { method: "POST" }),
      rate: (scanId: number, stars: 1 | 2 | 3 | 4 | 5) => call<ScanResponse>(scanPath(scanId, "rate"), { body: { stars } }),
      cancel: (scanId: number) => call<ScanResponse>(scanPath(scanId, "cancel"), { method: "POST" }),
    },

    /** /pro dashboard for one provider (no auth; ?provider=<id>). */
    pro: (providerId: number) => {
      const job = (id: number, action = "") => `/api/pro/jobs/${id}${action ? `/${action}` : ""}`;
      const p = { provider: providerId, auth: false } as const;
      return {
        queue: () => call<ProQueueResponse>("/api/pro/queue", p),
        job: (jobId: number) => call<ProJobDetail>(job(jobId), p),
        /** Take a routed or review job directly. `slot` is a `slots[].startsAt`; any price ($1–$100,000). */
        accept: (jobId: number, input: { slot: string; price: number }) => call<ProJobDetail>(job(jobId, "accept"), { ...p, body: input }),
        /** Send or update an offer on an open request (status "open"). `quote` is only a suggestion. */
        offer: (jobId: number, input: { slot: string; price: number }) => call<ProJobDetail>(job(jobId, "offer"), { ...p, body: input }),
        withdrawOffer: (jobId: number) => call<ProJobDetail>(job(jobId, "offer"), { ...p, method: "DELETE" }),
        askForMore: (jobId: number, input: Partial<MoreInfoRequest>) => call<ProJobDetail>(job(jobId, "ask-more"), { ...p, body: input }),
        /** Decline a routed job, or pass on an open request (returns `{ passed: true }`; it leaves your queue). */
        decline: (jobId: number) => call<ProJobDetail | { passed: true }>(job(jobId, "decline"), { ...p, method: "POST" }),
        routeToVirtualCall: (jobId: number) => call<ProJobDetail>(job(jobId, "virtual-call"), { ...p, method: "POST" }),
        setStatus: (jobId: number, to: "en_route" | "done") => call<ProJobDetail>(job(jobId, "status"), { ...p, body: { to } }),
        /** The profile interview: status, the open question, and the pricing prefill. */
        profile: () => call<ProfileView>("/api/pro/profile", p),
        /** One interview step. "pricing" ends it (and later edits prices): the rate card is built from these numbers. */
        profileAction: (body: ProfileAction) => call<ProfileView>("/api/pro/profile", { ...p, body }),
      };
    },

    /** All providers, for a /pro provider picker. */
    providers: () => call<{ providers: ProProvider[] }>("/api/pro/providers", { auth: false }),
  };
}

export type ScopeClient = ReturnType<typeof createScopeClient>;
