import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Home, JobSpec, Offer, Provider, Scan, ScanPhoto, ScopeJob, User } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import {
  FREE_ANSWER_MAX,
  needsApproval,
  quote,
  type HomeInfo,
  type PhotoMark,
  type HomeRecordItem,
  type JobSpecInfo,
  type MoreInfoRequest,
  type OfferInfo,
  type Question,
  type ScanPhotoInfo,
  type ScanResponse,
  type ScopeJobInfo,
  type ScopeJobStatus,
  type ShotResult,
  type Template,
} from "@/shared/scope";
import { checkShot, generateSpec, writeQuestions } from "./ai";
import { rankFit } from "./fit";
import { estimatePrice } from "./estimate";
import { distanceKm, etaMinutes, matchProviders, providersInRange, slotNear, virtualPartner } from "./matching";
import { pricingLive } from "./pricing-chat";
import { checkImage, readScanPhoto, signedPhotoUrl, writeScanPhoto, type ImageType } from "./photos";
import { getTemplate } from "./templates";

const { homes, scans, scanPhotos, jobSpecs, scopeJobs, providers, ratings, offers } = schema;

// ---------- Loading ----------

export function homeOf(user: User): Home | undefined {
  return db.select().from(homes).where(eq(homes.customerId, user.id)).get();
}

export function homeInfo(h: Home): HomeInfo {
  return { id: h.id, label: h.label, address: h.address, lat: h.lat, lng: h.lng, homeType: h.homeType ?? null };
}

export function saveHome(user: User, data: { label?: string; address: string; lat: number; lng: number; homeType?: string | null }) {
  const existing = homeOf(user);
  if (existing) {
    return db
      .update(homes)
      .set({
        address: data.address,
        lat: data.lat,
        lng: data.lng,
        ...(data.label ? { label: data.label } : {}),
        ...(data.homeType !== undefined ? { homeType: data.homeType } : {}),
      })
      .where(eq(homes.id, existing.id))
      .returning()
      .get();
  }
  return db
    .insert(homes)
    .values({ customerId: user.id, address: data.address, lat: data.lat, lng: data.lng, label: data.label ?? "My home", homeType: data.homeType ?? null })
    .returning()
    .get();
}

export function loadScanFor(user: User, scanId: number) {
  const row = db.select().from(scans).innerJoin(homes, eq(homes.id, scans.homeId)).where(eq(scans.id, scanId)).get();
  if (!row || row.homes.customerId !== user.id) throw new HttpError(404, "Scan not found.");
  return { scan: row.scans, home: row.homes };
}

export const photoUrl = (id: number) => `/api/scan-photos/${id}`;

export function scanPhotoRows(scanId: number) {
  return db.select().from(scanPhotos).where(eq(scanPhotos.scanId, scanId)).orderBy(asc(scanPhotos.id)).all();
}

/** The newest usable photo for each shot, in template order. */
export function bestPhotos(template: Template, rows: ScanPhoto[]) {
  return template.required_shots.flatMap((s) => {
    const p = rows.filter((r) => r.shotId === s.id && r.ok).at(-1);
    return p ? [p] : [];
  });
}

export function photoInfo(rows: ScanPhoto[]): ScanPhotoInfo[] {
  return rows.map((p) => ({ id: p.id, shotId: p.shotId, url: photoUrl(p.id), src: signedPhotoUrl(p.id), ok: p.ok, feedback: p.feedback }));
}

export function remainingShots(scan: Scan, template: Template, rows: ScanPhoto[]): string[] {
  if (scan.focus) {
    return template.required_shots.filter((s) => scan.focus!.shotIds.includes(s.id) && !scan.focusDone.includes(s.id)).map((s) => s.id);
  }
  return template.required_shots
    .filter((s) => !scan.skippedShots.includes(s.id) && !scan.coveredShots.includes(s.id) && !rows.some((r) => r.shotId === s.id && r.ok))
    .map((s) => s.id);
}

export function latestSpec(scanId: number): JobSpec | undefined {
  return db.select().from(jobSpecs).where(eq(jobSpecs.scanId, scanId)).orderBy(desc(jobSpecs.version)).get();
}

export function specInfo(s: JobSpec): JobSpecInfo {
  return {
    id: s.id,
    version: s.version,
    trade: s.trade,
    title: s.title,
    summary: s.summary,
    severity: s.severity,
    areaM2: s.areaM2,
    confidence: s.confidence,
    hours: s.hours ?? null,
    complexity: s.complexity ?? null,
    partsCost: s.partsCost ?? null,
    fields: s.fields,
    priceLow: s.priceLow,
    priceHigh: s.priceHigh,
    priceBasis: s.priceBasis ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

export function jobOfScan(scanId: number): ScopeJob | undefined {
  return db.select().from(scopeJobs).where(eq(scopeJobs.scanId, scanId)).get();
}

export function jobInfo(job: ScopeJob, home: Pick<Home, "lat" | "lng">): ScopeJobInfo {
  const provider = job.providerId ? db.select().from(providers).where(eq(providers.id, job.providerId)).get() : undefined;
  const rating = db.select().from(ratings).where(eq(ratings.jobId, job.id)).get();
  return {
    id: job.id,
    status: job.status,
    mode: job.mode,
    provider: provider ? { id: provider.id, name: provider.name, rating: provider.rating, ratingCount: provider.ratingCount, phone: provider.phone } : null,
    distanceKm: provider ? Math.round(distanceKm(home, provider) * 10) / 10 : null,
    slot: job.slot?.toISOString() ?? null,
    requestedSlot: job.requestedSlot?.toISOString() ?? null,
    eta: job.eta?.toISOString() ?? null,
    price: job.price,
    request: job.request ?? null,
    rating: rating?.stars ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

// ---------- Offers ----------

export function offerInfo(o: Offer, p: Provider, home: Pick<Home, "lat" | "lng">): OfferInfo {
  const km = distanceKm(home, p);
  return {
    id: o.id,
    provider: { id: p.id, name: p.name, rating: p.rating, ratingCount: p.ratingCount },
    distanceKm: Math.round(km * 10) / 10,
    etaMinutes: etaMinutes(km),
    price: o.price,
    slot: o.slot.toISOString(),
    status: o.status,
    byAgent: o.byAgent ?? false,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

/** Active offers on a job, cheapest first, then soonest. */
export function activeOffers(jobId: number, home: Pick<Home, "lat" | "lng">): OfferInfo[] {
  return db
    .select()
    .from(offers)
    .innerJoin(providers, eq(providers.id, offers.providerId))
    .where(and(eq(offers.jobId, jobId), eq(offers.status, "active")))
    .all()
    .map((r) => offerInfo(r.offers, r.providers, home))
    .sort((a, b) => a.price - b.price || a.slot.localeCompare(b.slot));
}

/** Closes a job's open offers, e.g. after cancel or once one is accepted. */
function closeOffers(jobId: number) {
  db.update(offers)
    .set({ status: "lost", updatedAt: new Date() })
    .where(and(eq(offers.jobId, jobId), inArray(offers.status, ["active", "stale"])))
    .run();
}

/** True for a job that went out to several pros at once (not one chosen pro). */
export const isBroadcast = (job: ScopeJob) => job.providerId == null && job.invited.length > 0;

export function scanInfo(scan: Scan): ScanResponse["scan"] {
  return {
    id: scan.id,
    trade: scan.trade,
    status: scan.status,
    answers: scan.answers,
    notes: scan.notes,
    skippedShots: scan.skippedShots,
    description: scan.description ?? null,
    mark: scan.mark ?? null,
    focus: scan.focus ?? null,
    questions: scan.questions ?? null,
    createdAt: scan.createdAt.toISOString(),
  };
}

export function scanResponse(scan: Scan, home: Home): ScanResponse {
  const template = getTemplate(scan.trade);
  const rows = scanPhotoRows(scan.id);
  const spec = latestSpec(scan.id);
  const job = jobOfScan(scan.id);
  // Show ranked pros while the homeowner is choosing, or after a pro declined.
  const choosing = spec && (scan.status === "spec_ready" || job?.status === "declined");
  return {
    scan: scanInfo(scan),
    template,
    home: homeInfo(home),
    photos: photoInfo(rows),
    remainingShots: remainingShots(scan, template, rows),
    spec: spec ? specInfo(spec) : null,
    job: job ? jobInfo(job, home) : null,
    matches: choosing ? matchProviders(scan.trade, home, spec, job?.declinedBy ?? []) : [],
    offers: job?.status === "open" ? activeOffers(job.id, home) : [],
    invitedCount: job?.invited.length ?? 0,
    passedCount: job ? job.invited.filter((id) => job.declinedBy.includes(id)).length : 0,
  };
}

// ---------- Home Record ----------

export function homeRecord(home: Home): HomeRecordItem[] {
  const rows = db.select().from(scans).where(eq(scans.homeId, home.id)).orderBy(desc(scans.updatedAt)).all();
  if (!rows.length) return [];
  const ids = rows.map((s) => s.id);
  const specs = db.select().from(jobSpecs).where(inArray(jobSpecs.scanId, ids)).orderBy(asc(jobSpecs.version)).all();
  const jobs = db.select().from(scopeJobs).where(inArray(scopeJobs.scanId, ids)).all();
  const provs = db.select().from(providers).all();
  const okPhotos = db.select().from(scanPhotos).where(and(inArray(scanPhotos.scanId, ids), eq(scanPhotos.ok, true))).orderBy(asc(scanPhotos.id)).all();
  return rows.map((s) => {
    const t = getTemplateSafe(s.trade);
    const spec = specs.filter((x) => x.scanId === s.id).at(-1);
    const job = jobs.find((j) => j.scanId === s.id);
    // On an open request nobody has the job yet; name the pro who asked for more, if any.
    const asker = job?.status === "more_info" ? job.request?.providerId : null;
    const provider = provs.find((p) => p.id === (job?.providerId ?? asker));
    const open = job?.status === "open" ? activeOffers(job.id, home) : [];
    const rating = job ? db.select().from(ratings).where(eq(ratings.jobId, job.id)).get() : undefined;
    const needsAction =
      ["capturing", "clarifying", "spec_ready"].includes(s.status) ||
      (!!job && ["more_info", "declined"].includes(job.status)) ||
      open.length > 0 ||
      (job?.status === "done" && !rating);
    const updated = job && job.updatedAt > s.updatedAt ? job.updatedAt : s.updatedAt;
    return {
      scanId: s.id,
      trade: s.trade,
      tradeLabel: t?.label ?? s.trade,
      title: spec?.title ?? t?.label ?? "Scan",
      scanStatus: s.status,
      jobStatus: job?.status ?? null,
      providerName: provider?.name ?? null,
      priceLow: spec?.priceLow ?? null,
      priceHigh: spec?.priceHigh ?? null,
      price: job?.price ?? null,
      slot: (job?.slot ?? job?.requestedSlot)?.toISOString() ?? null,
      slotConfirmed: !!job?.slot,
      rating: rating?.stars ?? null,
      request: job?.status === "more_info" ? (job.request ?? null) : null,
      offerCount: open.length,
      bestOffer: open[0] ? { price: open[0].price, providerName: open[0].provider.name } : null,
      photoSrc: (() => {
        const p = okPhotos.find((x) => x.scanId === s.id);
        return p ? signedPhotoUrl(p.id) : null;
      })(),
      needsAction: s.status !== "cancelled" && needsAction,
      updatedAt: updated.toISOString(),
    };
  });
}

function getTemplateSafe(trade: string) {
  try {
    return getTemplate(trade);
  } catch {
    return null;
  }
}

// ---------- Capture ----------

const touch = (scanId: number, set: Partial<Scan> = {}) =>
  db.update(scans).set({ ...set, updatedAt: new Date() }).where(eq(scans.id, scanId)).returning().get();

/** `description` is what the homeowner said on the voice screen, if they started there. */
export function startScan(home: Home, trade: string, description?: string | null) {
  getTemplate(trade);
  return db.insert(scans).values({ homeId: home.id, trade, description: description?.trim() || null }).returning().get();
}

/** The homeowner's dot on one of their photos ("this is where it leaks"). */
export function setMark(scan: Scan, mark: PhotoMark) {
  const template = getTemplate(scan.trade);
  if (!template.required_shots.some((s) => s.id === mark.shotId)) throw new HttpError(400, "Unknown shot.");
  if (!scanPhotoRows(scan.id).some((p) => p.shotId === mark.shotId && p.ok)) throw new HttpError(400, "Take that photo first.");
  touch(scan.id, { mark });
}

function requireCapturing(scan: Scan, template: Template, shotId: string) {
  if (scan.status !== "capturing") throw new HttpError(409, "This scan isn't taking photos right now.");
  const shot = template.required_shots.find((s) => s.id === shotId);
  if (!shot) throw new HttpError(400, `Unknown shot "${shotId}".`);
  return shot;
}

/** After each change, move on to questions once every shot is captured or skipped. */
function afterShot(scan: Scan, template: Template): ShotResult["status"] {
  const left = remainingShots(scan, template, scanPhotoRows(scan.id));
  if (left.length) return scan.status;
  touch(scan.id, { status: "clarifying" });
  return "clarifying";
}

// One vision check per scan at a time (single server process).
const checking = new Set<number>();

export async function recordShot(scan: Scan, shotId: string, file: File): Promise<ShotResult> {
  const template = getTemplate(scan.trade);
  const shot = requireCapturing(scan, template, shotId);
  const type = checkImage(file);
  if (checking.has(scan.id)) throw new HttpError(409, "Still checking your last photo — one moment.");
  checking.add(scan.id);
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    // The photo may already show shots still to come; those aren't asked for. Not while answering a pro's
    // "ask for more": they asked for those shots by name.
    const left = remainingShots(scan, template, scanPhotoRows(scan.id));
    const upcoming = scan.focus ? [] : template.required_shots.filter((s) => s.id !== shotId && left.includes(s.id));
    const check = await checkShot(template, shot, { data: bytes, type }, upcoming);
    const path = await writeScanPhoto(scan.id, bytes, type);
    db.insert(scanPhotos)
      .values({ scanId: scan.id, shotId, path, mime: type, ok: check.ok, feedback: check.message, observation: check.ok ? check.observation : null })
      .run();
    let current = scan;
    if (check.ok) {
      current = touch(scan.id, {
        skippedShots: scan.skippedShots.filter((s) => s !== shotId),
        coveredShots: [...new Set([...scan.coveredShots.filter((s) => s !== shotId), ...check.covers])],
        ...(scan.focus ? { focusDone: [...new Set([...scan.focusDone, shotId])] } : {}),
      });
    }
    const status = check.ok ? afterShot(current, template) : current.status;
    return { ok: check.ok, message: check.message, status, remainingShots: remainingShots({ ...current, status }, template, scanPhotoRows(scan.id)) };
  } finally {
    checking.delete(scan.id);
  }
}

export function skipShot(scan: Scan, shotId: string): ShotResult {
  const template = getTemplate(scan.trade);
  const shot = requireCapturing(scan, template, shotId);
  if (!shot.optional) throw new HttpError(400, "This shot is needed for an accurate estimate.");
  const current = touch(scan.id, {
    skippedShots: [...new Set([...scan.skippedShots, shotId])],
    ...(scan.focus ? { focusDone: [...new Set([...scan.focusDone, shotId])] } : {}),
  });
  const status = afterShot(current, template);
  return { ok: true, message: "Skipped.", status, remainingShots: remainingShots({ ...current, status }, template, scanPhotoRows(scan.id)) };
}

/** Nothing to photograph (templates with `no_photos`, e.g. hidden mold): skip every shot and keep what they described. */
export function describeInstead(scan: Scan, description: string) {
  const template = getTemplate(scan.trade);
  if (!template.no_photos) throw new HttpError(400, "This job needs photos.");
  if (scan.status !== "capturing" || scan.focus) throw new HttpError(409, "This scan isn't taking photos right now.");
  touch(scan.id, {
    description: [scan.description, description.trim()].filter(Boolean).join("\n\n"),
    skippedShots: template.required_shots.map((s) => s.id),
    status: "clarifying",
  });
}

// ---------- Questions → JobSpec ----------

/**
 * The template with this scan's agent-written questions first, then the template's own (same id = same
 * question). Every agent and view that reads answers by question id gets the right wording from it.
 */
export function scanTemplate(template: Template, scan: Pick<Scan, "questions">): Template {
  if (!scan.questions?.length) return template;
  const ids = new Set(scan.questions.map((q) => q.id));
  return { ...template, questions: [...scan.questions, ...template.questions.filter((q) => !ids.has(q.id))] };
}

/** What the homeowner is asked right now: the questions a pro picked, else the agent's (or the template's until written). */
function askedQuestions(scan: Scan, template: Template): Question[] {
  // A question the pro asked for must be answered, even if the questions agent first wrote it as optional.
  if (scan.focus) return scanTemplate(template, scan).questions.filter((q) => scan.focus!.questionIds.includes(q.id)).map((q) => ({ ...q, optional: false }));
  return scan.questions ?? template.questions;
}

// One questions-agent call per scan at a time; a second request waits for the same answer.
const writingQuestions = new Map<number, Promise<Question[]>>();

/**
 * The scan's follow-up questions. The first time the scan reaches its questions, the questions agent
 * writes them from what the homeowner said and what the photos showed; they're stored so the
 * homeowner, finishScan and the pro all see the same list.
 */
export async function ensureQuestions(scan: Scan, home: Home): Promise<Question[]> {
  const template = getTemplate(scan.trade);
  if (scan.focus || scan.questions || scan.status !== "clarifying") return askedQuestions(scan, template);
  const running = writingQuestions.get(scan.id);
  if (running) return running;
  const work = (async () => {
    const rows = bestPhotos(template, scanPhotoRows(scan.id));
    const questions = await writeQuestions({
      template,
      description: scan.description ?? null,
      observations: rows.map((p) => ({ shotId: p.shotId, observation: p.observation })),
      skippedShots: scan.skippedShots,
      coveredShots: scan.coveredShots,
      mark: scan.mark ?? null,
      // What the nearby pros told their pricing agent to ask, so their quotes have what they need.
      proAsks: [...new Set(providersInRange(scan.trade, home).filter(pricingLive).flatMap((p) => p.pricing?.asks ?? []))].slice(0, 12),
    });
    touch(scan.id, { questions });
    return questions;
  })();
  writingQuestions.set(scan.id, work);
  try {
    return await work;
  } finally {
    writingQuestions.delete(scan.id);
  }
}

const generating = new Set<number>();

export async function finishScan(scan: Scan, home: Home, input: { answers: Record<string, string>; notes?: string | null }) {
  if (scan.status !== "clarifying") throw new HttpError(409, "This scan isn't waiting for answers.");
  const template = scanTemplate(getTemplate(scan.trade), scan);
  const asked = askedQuestions(scan, getTemplate(scan.trade));

  const answers = { ...scan.answers };
  for (const q of asked) {
    const a = input.answers[q.id];
    if (a === undefined || a === "") {
      if (!q.optional) throw new HttpError(400, `Please answer: ${q.q}`);
      continue;
    }
    // One of the options, or the homeowner's own words ("Something else? Write it").
    const answer = a.trim();
    if (!answer || answer.length > FREE_ANSWER_MAX) throw new HttpError(400, `Please answer in a few words: ${q.q}`);
    answers[q.id] = answer;
  }
  const note = input.notes?.trim() || null;
  const notes = scan.focus && note ? [scan.notes, `Reply to the pro: ${note}`].filter(Boolean).join("\n") : note ?? scan.notes;
  touch(scan.id, { answers, notes });

  if (generating.has(scan.id)) throw new HttpError(409, "Already preparing your estimate — one moment.");
  generating.add(scan.id);
  try {
    const rows = scanPhotoRows(scan.id);
    const best = bestPhotos(template, rows);
    if (!best.length && !template.no_photos) throw new HttpError(400, "Take at least one photo first.");
    const job = jobOfScan(scan.id);
    const generated = await generateSpec({
      template,
      photos: await Promise.all(best.map(async (p) => ({ shotId: p.shotId, observation: p.observation, image: { data: await readScanPhoto(p), type: p.mime as ImageType } }))),
      skippedShots: scan.skippedShots,
      coveredShots: scan.coveredShots,
      answers,
      notes,
      description: scan.description ?? null,
      mark: scan.mark ?? null,
      proRequest: job?.request?.message ?? null,
    });

    // Each pro's price is their rates × the spec's estimated hours and parts (code, no agent).
    // The matching agent ranks the in-range pros by how their profile fits this problem.
    // With nobody in range, the estimate agent gives the homeowner a best-guess price for their area instead.
    const inRange = providersInRange(scan.trade, home, job?.declinedBy ?? []);
    const [fit, estimate] = await Promise.all([
      rankFit({
        template,
        spec: generated,
        answers,
        notes,
        candidates: inRange.map((p) => {
          const km = distanceKm(home, p);
          return { provider: p, distanceKm: Math.round(km * 10) / 10, etaMinutes: etaMinutes(km) };
        }),
      }),
      inRange.length ? null : estimatePrice({ template, spec: generated, answers, notes, home }),
    ]);
    const matches = matchProviders(scan.trade, home, { ...generated, fit }, job?.declinedBy ?? []);
    const top = matches[0];
    // Always a price for the homeowner: the top pro's, or the best guess.
    const price = top ? { low: top.quote.low, high: top.quote.high, basis: null } : (estimate ?? (await estimatePrice({ template, spec: generated, answers, notes, home })));
    const prev = latestSpec(scan.id);

    const saved = db.transaction((tx) => {
      const spec = tx
        .insert(jobSpecs)
        .values({
          scanId: scan.id,
          version: (prev?.version ?? 0) + 1,
          trade: scan.trade,
          title: generated.title,
          summary: generated.summary,
          fields: generated.fields,
          severity: generated.severity,
          areaM2: generated.areaM2,
          confidence: generated.confidence,
          hours: generated.hours,
          complexity: generated.complexity,
          partsCost: generated.partsCost,
          priceLow: price.low,
          priceHigh: price.high,
          priceBasis: price.basis,
          pricedForProviderId: top?.id ?? null,
          fit,
        })
        .returning()
        .get();
      const now = new Date();

      if (job && isBroadcast(job)) {
        // Answering an "ask for more" on an open request: reopen it to every invited pro.
        // Offers were made against the old spec, so pros re-send them.
        tx.update(scopeJobs).set({ specId: spec.id, status: "open", request: null, updatedAt: now }).where(eq(scopeJobs.id, job.id)).run();
        tx.update(offers).set({ status: "stale", updatedAt: now }).where(and(eq(offers.jobId, job.id), eq(offers.status, "active"))).run();
        tx.update(scans).set({ status: "submitted", focus: null, focusDone: [], updatedAt: now }).where(eq(scans.id, scan.id)).run();
      } else if (job) {
        // Answering a pro's "ask for more": back to their New tab with the updated spec.
        tx.update(scopeJobs).set({ specId: spec.id, status: "pending", request: null, updatedAt: now }).where(eq(scopeJobs.id, job.id)).run();
        tx.update(scans).set({ status: "submitted", focus: null, focusDone: [], updatedAt: now }).where(eq(scans.id, scan.id)).run();
      } else {
        // Always priced, however unsure the agent is: low confidence only flags the spec for pros.
        // The homeowner can still ask for a person (askForHuman).
        tx.update(scans).set({ status: "spec_ready", updatedAt: now }).where(eq(scans.id, scan.id)).run();
      }
      return spec;
    });
    // A reopened request: the pricing agents re-send their offers against the new spec.
    if (job && isBroadcast(job)) sendAgentOffers(job.id);
    return saved;
  } finally {
    generating.delete(scan.id);
  }
}

// ---------- Booking & tracking ----------

/** A slot from slotsFor(): a valid time from now (5 min grace) up to a week out. */
export function parseSlot(iso: string): Date {
  const slot = new Date(iso);
  const week = Date.now() + 7 * 24 * 3600 * 1000;
  if (Number.isNaN(slot.getTime()) || slot.getTime() < Date.now() - 5 * 60 * 1000 || slot.getTime() > week) {
    throw new HttpError(400, "Pick one of the offered time slots.");
  }
  return slot;
}

/** Updates a job only if it's still in one of `from` (so two clicks can't both win). */
export function moveJob(job: ScopeJob, from: ScopeJobStatus[], set: Partial<ScopeJob>): ScopeJob {
  if (!from.includes(job.status)) throw new HttpError(409, `This job is ${job.status.replace("_", " ")} and can't do that now.`);
  const updated = db
    .update(scopeJobs)
    .set({ ...set, updatedAt: new Date() })
    .where(and(eq(scopeJobs.id, job.id), eq(scopeJobs.status, job.status)))
    .returning()
    .get();
  if (!updated) throw new HttpError(409, "This job was just updated. Refresh and try again.");
  return updated;
}

/** "Get offers": sends the spec to every matching pro at once. Each can send a price and time. */
/**
 * The pricing agents' offers: every invited pro with approved pricing whose quote is within their limit
 * gets an offer sent for them, at that price, in their first free time (the homeowner's preferred
 * time when it fits). Pros over their limit, or without approved pricing, review the request themselves.
 */
export function sendAgentOffers(jobId: number) {
  const job = db.select().from(scopeJobs).where(eq(scopeJobs.id, jobId)).get();
  if (!job || job.status !== "open" || !job.specId) return 0;
  const spec = db.select().from(jobSpecs).where(eq(jobSpecs.id, job.specId)).get();
  const scan = db.select().from(scans).where(eq(scans.id, job.scanId)).get();
  const home = scan && db.select().from(homes).where(eq(homes.id, scan.homeId)).get();
  if (!spec || !scan || !home) return 0;
  const invited = job.invited.length ? db.select().from(providers).where(inArray(providers.id, job.invited)).all() : [];
  const now = new Date();
  let sent = 0;
  for (const p of invited) {
    if (!pricingLive(p) || job.declinedBy.includes(p.id)) continue;
    const q = quote(p.rateCard, spec);
    if (needsApproval(p.rateCard, q)) continue;
    const at = slotNear(p, spec, job.requestedSlot ?? null, now);
    if (!at) continue;
    // Never overwrite an offer the pro sent by hand.
    const mine = db.select().from(offers).where(and(eq(offers.jobId, job.id), eq(offers.providerId, p.id))).get();
    if (mine && !mine.byAgent && mine.status === "active") continue;
    db.insert(offers)
      .values({ jobId: job.id, providerId: p.id, price: q.price, slot: at, status: "active", byAgent: true })
      .onConflictDoUpdate({ target: [offers.jobId, offers.providerId], set: { price: q.price, slot: at, status: "active", byAgent: true, updatedAt: now } })
      .run();
    sent++;
  }
  if (sent) db.update(scopeJobs).set({ updatedAt: now }).where(eq(scopeJobs.id, job.id)).run();
  return sent;
}

export function requestOffers(scan: Scan, home: Home, slot?: string) {
  const requestedSlot = slot ? parseSlot(slot) : null;
  const spec = latestSpec(scan.id);
  if (!spec) throw new HttpError(409, "There's no estimate to send yet.");
  const job = jobOfScan(scan.id);
  if (!job && scan.status !== "spec_ready") throw new HttpError(409, "This scan can't be sent right now.");
  const matches = matchProviders(scan.trade, home, spec, job?.declinedBy ?? []);
  if (!matches.length) throw new HttpError(409, "No pros cover this job right now. Try a virtual call.");
  const set = { status: "open" as const, providerId: null, specId: spec.id, mode: "onsite" as const, requestedSlot, invited: matches.map((m) => m.id) };

  const id = job ? moveJob(job, ["declined"], set).id : db.insert(scopeJobs).values({ scanId: scan.id, ...set }).returning().get().id;
  touch(scan.id, { status: "submitted" });
  sendAgentOffers(id);
}

/** The homeowner picks one offer: that pro gets the job and every other offer closes. */
export function acceptOffer(scan: Scan, offerId: number): { provider: Provider; jobId: number } {
  const job = jobOfScan(scan.id);
  const row = db.select().from(offers).innerJoin(providers, eq(providers.id, offers.providerId)).where(eq(offers.id, offerId)).get();
  if (!job || !row || row.offers.jobId !== job.id) throw new HttpError(404, "Offer not found.");
  if (row.offers.status !== "active") throw new HttpError(409, "That offer is no longer available.");
  const o = row.offers;
  db.transaction(() => {
    moveJob(job, ["open"], { status: "accepted", providerId: o.providerId, slot: o.slot, eta: o.slot, price: o.price });
    closeOffers(job.id);
    db.update(offers).set({ status: "accepted", updatedAt: new Date() }).where(eq(offers.id, o.id)).run();
  });
  return { provider: row.providers, jobId: job.id };
}

/** No pro in range (or all declined): ask the trade's virtual partner for a video call. */
export function requestVirtualCall(scan: Scan, slot?: string) {
  const requestedSlot = slot ? parseSlot(slot) : null;
  const spec = latestSpec(scan.id);
  if (!spec) throw new HttpError(409, "There's no scan to share yet.");
  const job = jobOfScan(scan.id);
  // Nobody left? providerId stays null and every pro in the trade sees it under Needs review.
  const partner = virtualPartner(scan.trade, job?.declinedBy ?? []);
  const set = { status: "virtual_call" as const, mode: "virtual" as const, providerId: partner?.id ?? null, specId: spec.id, requestedSlot };
  if (job) {
    moveJob(job, ["declined", "handoff", "open"], set);
    closeOffers(job.id);
  } else if (scan.status === "spec_ready") db.insert(scopeJobs).values({ scanId: scan.id, ...set }).run();
  else throw new HttpError(409, "This scan can't request a call right now.");
  touch(scan.id, { status: "submitted" });
}

/** Homeowner prefers a person: same as a low-confidence handoff. */
export function askForHuman(scan: Scan, home: Home) {
  const spec = latestSpec(scan.id);
  if (!spec || scan.status !== "spec_ready" || jobOfScan(scan.id)) throw new HttpError(409, "This scan can't be handed off right now.");
  const top = matchProviders(scan.trade, home, spec)[0];
  db.insert(scopeJobs)
    .values({ scanId: scan.id, specId: spec.id, status: "handoff", providerId: top?.id ?? virtualPartner(scan.trade)?.id ?? null })
    .run();
  touch(scan.id, { status: "submitted" });
}

/** The pro asked for more: reopen the scan for just those shots and questions. */
export function reopenForMore(scan: Scan) {
  const job = jobOfScan(scan.id);
  if (!job || job.status !== "more_info" || !job.request) throw new HttpError(409, "Nothing was requested for this scan.");
  const template = getTemplate(scan.trade);
  const shotIds = job.request.shotIds.filter((id) => template.required_shots.some((s) => s.id === id));
  touch(scan.id, { status: shotIds.length ? "capturing" : "clarifying", focus: { ...job.request, shotIds }, focusDone: [] });
}

export function rate(scan: Scan, stars: number, review: { tags?: string[]; note?: string | null } = {}) {
  const job = jobOfScan(scan.id);
  if (!job || job.status !== "done") throw new HttpError(409, "You can rate the job once it's done.");
  if (db.select().from(ratings).where(eq(ratings.jobId, job.id)).get()) throw new HttpError(409, "You've already rated this job.");
  db.transaction((tx) => {
    tx.insert(ratings).values({ jobId: job.id, stars, tags: review.tags ?? [], note: review.note?.trim() || null }).run();
    if (job.providerId) {
      const p = tx.select().from(providers).where(eq(providers.id, job.providerId)).get() as Provider;
      const count = p.ratingCount + 1;
      tx.update(providers)
        .set({ rating: Math.round(((p.rating * p.ratingCount + stars) / count) * 100) / 100, ratingCount: count })
        .where(eq(providers.id, p.id))
        .run();
    }
    tx.update(scopeJobs).set({ updatedAt: new Date() }).where(eq(scopeJobs.id, job.id)).run();
  });
}

export function cancel(scan: Scan) {
  const job = jobOfScan(scan.id);
  if (job) {
    moveJob(job, ["open", "pending", "accepted", "handoff", "virtual_call", "more_info", "declined"], { status: "cancelled" });
    closeOffers(job.id);
  }
  else if (scan.status === "cancelled") return;
  touch(scan.id, { status: "cancelled", focus: null });
}

export type { MoreInfoRequest };
