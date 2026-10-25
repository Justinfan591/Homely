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
  AddressSuggestion,
  ClassifyResult,
  CodeLoginResponse,
  HomeInfo,
  HomeResponse,
  MoreInfoRequest,
  ProJobDetail,
  ProProvider,
  ProQueueResponse,
  ProfileInfo,
  ProviderPricing,
  ProfileView,
  Question,
  ScanPhotoInfo,
  ScanResponse,
  ShotResult,
  Slot,
  TemplateSummary,
  WeekHours,
} from "./scope";

export type ProfileAction =
  | { action: "start" | "retry" | "skip" }
  | { action: "answer"; answer: string[]; note?: string | null }
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

  /** Adds a file part: a Blob as-is, a React Native / Expo file object as the object itself. */
  const appendFile = (form: FormData, field: string, file: PhotoInput, filename: string) => {
    if (typeof Blob !== "undefined" && file instanceof Blob) form.append(field, file, filename);
    else form.append(field, file as unknown as Blob);
  };

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
      /** Sign-in step 1: phone or email. The demo sends nothing; the code is always the server's DEMO_LOGIN_CODE. */
      startCode: (contact: string) => call<{ sentTo: string; length: number }>("/api/auth/code", { body: { contact }, auth: false }),
      /** Sign-in step 2: signs in, creating a homeowner the first time. `isNew`: ask for name and home next. */
      verifyCode: (contact: string, code: string) => call<CodeLoginResponse>("/api/auth/code/verify", { body: { contact, code }, auth: false }),
    },

    /** Homeowner flow. Needs a customer token (getToken). */
    homeowner: {
      templates: () => call<{ templates: TemplateSummary[] }>("/api/templates"),
      /** Home + Home Record. `home` is null until setHome is called. */
      home: () => call<HomeResponse>("/api/home"),
      setHome: (home: { address: string; lat: number; lng: number; label?: string }) => call<{ home: HomeInfo }>("/api/home", { method: "PUT", body: home }),
      /** Name, age, address and home type. */
      profile: () => call<ProfileInfo>("/api/profile"),
      /** Only the fields sent change. A new address is geocoded on the server, unless `lat`/`lng` say where it is. */
      updateProfile: (data: { name?: string; age?: number | null; address?: string; homeType?: string | null; lat?: number; lng?: number }) =>
        call<ProfileInfo>("/api/profile", { method: "PUT", body: data }),
      /** "Tell us what's wrong": a voice recording → its text. */
      transcribe: (audio: PhotoInput, filename = "recording.m4a") => {
        const form = new FormData();
        appendFile(form, "audio", audio, filename);
        return call<{ text: string }>("/api/intake/transcribe", { form });
      },
      /** Current position → a street address ("12 Main St, Toronto"), or null if it can't be found. */
      reverseGeocode: (lat: number, lng: number) => call<{ address: string | null }>(`/api/geocode/reverse?lat=${lat}&lng=${lng}`),
      /** Address type-ahead: up to 5 suggestions for what they've typed (3+ characters). */
      searchAddresses: (q: string) => call<{ suggestions: AddressSuggestion[] }>(`/api/geocode/search?q=${encodeURIComponent(q)}`),
      /** Which trade the description (and optional screening photo) is about. Nothing is stored. */
      classify: (text: string, photo?: PhotoInput | null) => {
        const form = new FormData();
        form.append("text", text);
        if (photo) appendFile(form, "photo", photo, "photo.jpg");
        return call<ClassifyResult>("/api/intake/classify", { form });
      },
      /** "Scan a problem" → returns the new scan id. 409 if the home isn't set. `description`: what they said on the voice screen. */
      startScan: (trade: string, description?: string | null) => call<{ id: number }>("/api/scans", { body: { trade, description } }),
      /** Everything the scan screens render. Poll every 2 s while tracking. */
      scan: (scanId: number) => call<ScanResponse>(scanPath(scanId)),
      /** Upload one shot; Claude checks it. `ok: false` means retake (show `message`). */
      uploadShot: (scanId: number, shotId: string, photo: PhotoInput, filename = "photo.jpg") => {
        const form = new FormData();
        form.append("shotId", shotId);
        appendFile(form, "photo", photo, filename);
        return call<ShotResult>(scanPath(scanId, "shots"), { form });
      },
      /** Skip an optional shot (show the shot's `skip_label` as the button). */
      skipShot: (scanId: number, shotId: string) => call<ShotResult>(scanPath(scanId, "skip"), { body: { shotId } }),
      /** Templates with `no_photos` (mold): skip every shot and describe the symptoms and where instead. Goes straight to the questions. */
      describeInstead: (scanId: number, description: string) => call<ScanResponse>(scanPath(scanId, "describe"), { body: { description } }),
      /**
       * The follow-up questions the agent wrote for this scan, from what was said and photographed
       * (written once, then stored). Call when the scan reaches "clarifying". Answer by `id` in finish().
       */
      questions: (scanId: number) => call<{ questions: Question[] }>(scanPath(scanId, "questions"), { method: "POST" }),
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
      /** "Move the dot to the leak": x and y in % of the photo. */
      mark: (scanId: number, mark: { shotId: string; x: number; y: number }) => call<ScanResponse>(scanPath(scanId, "mark"), { body: mark }),
      rate: (scanId: number, stars: 1 | 2 | 3 | 4 | 5, review: { tags?: string[]; note?: string | null } = {}) =>
        call<ScanResponse>(scanPath(scanId, "rate"), { body: { stars, ...review } }),
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
        /** The profile interview: status and the open question. */
        profile: () => call<ProfileView>("/api/pro/profile", p),
        /** One interview step. */
        profileAction: (body: ProfileAction) => call<ProfileView>("/api/pro/profile", { ...p, body }),
        /** Pricing chat: messages, draft rates, what the agent asks homeowners, and draft/live. */
        pricing: () => call<ProviderPricing>("/api/pro/pricing", p),
        /** Tell the pricing agent how you charge; it replies and updates the draft. */
        pricingMessage: (message: string) => call<ProviderPricing>("/api/pro/pricing", { ...p, body: { action: "message", message } }),
        /** Approve the draft: it becomes your rates, and the agent sends offers up to your limit. */
        approvePricing: () => call<ProviderPricing>("/api/pro/pricing", { ...p, body: { action: "approve" } }),
        /** Working hours (7 days, Monday first × 48 half-hours). Offers and slots fall inside them. */
        hours: () => call<{ hours: WeekHours }>("/api/pro/hours", p),
        setHours: (hours: WeekHours) => call<{ hours: WeekHours }>("/api/pro/hours", { ...p, method: "PUT", body: { hours } }),
      };
    },

    /** All providers, for a /pro provider picker. */
    providers: () => call<{ providers: ProProvider[] }>("/api/pro/providers", { auth: false }),
  };
}

export type ScopeClient = ReturnType<typeof createScopeClient>;
