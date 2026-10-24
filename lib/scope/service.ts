import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Home, JobSpec, Provider, Scan, ScanPhoto, ScopeJob, User } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import {
  HANDOFF_CONFIDENCE,
  type HomeInfo,
  type HomeRecordItem,
  type JobSpecInfo,
  type MoreInfoRequest,
  type ScanPhotoInfo,
  type ScanResponse,
  type ScopeJobInfo,
  type ScopeJobStatus,
  type ShotResult,
  type Template,
} from "@/shared/scope";
import { checkShot, generateSpec } from "./ai";
import { distanceKm, matchProviders, virtualPartner } from "./matching";
import { checkImage, readScanPhoto, signedPhotoUrl, writeScanPhoto, type ImageType } from "./photos";
import { getTemplate } from "./templates";

const { homes, scans, scanPhotos, jobSpecs, scopeJobs, providers, ratings } = schema;

// ---------- Loading ----------

export function homeOf(user: User): Home | undefined {
  return db.select().from(homes).where(eq(homes.customerId, user.id)).get();
}

export function homeInfo(h: Home): HomeInfo {
  return { id: h.id, label: h.label, address: h.address, lat: h.lat, lng: h.lng };
}

export function saveHome(user: User, data: { label?: string; address: string; lat: number; lng: number }) {
  const existing = homeOf(user);
  if (existing) {
    return db
      .update(homes)
      .set({ address: data.address, lat: data.lat, lng: data.lng, ...(data.label ? { label: data.label } : {}) })
      .where(eq(homes.id, existing.id))
      .returning()
      .get();
  }
  return db
    .insert(homes)
    .values({ customerId: user.id, address: data.address, lat: data.lat, lng: data.lng, label: data.label ?? "My home" })
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
    .filter((s) => !scan.skippedShots.includes(s.id) && !rows.some((r) => r.shotId === s.id && r.ok))
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
    fields: s.fields,
    priceLow: s.priceLow,
    priceHigh: s.priceHigh,
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

export function scanInfo(scan: Scan): ScanResponse["scan"] {
  return {
    id: scan.id,
    trade: scan.trade,
    status: scan.status,
    answers: scan.answers,
    notes: scan.notes,
    skippedShots: scan.skippedShots,
    focus: scan.focus ?? null,
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
    const provider = provs.find((p) => p.id === job?.providerId);
    const needsAction =
      ["capturing", "clarifying", "spec_ready"].includes(s.status) || (!!job && ["more_info", "declined"].includes(job.status)) || (job?.status === "done" && !db.select().from(ratings).where(eq(ratings.jobId, job.id)).get());
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
      request: job?.status === "more_info" ? (job.request ?? null) : null,
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

export function startScan(home: Home, trade: string) {
  getTemplate(trade);
  return db.insert(scans).values({ homeId: home.id, trade }).returning().get();
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
    const check = await checkShot(template, shot, { data: bytes, type });
    const path = await writeScanPhoto(scan.id, bytes, type);
    db.insert(scanPhotos)
      .values({ scanId: scan.id, shotId, path, mime: type, ok: check.ok, feedback: check.message, observation: check.ok ? check.observation : null })
      .run();
    let current = scan;
    if (check.ok) {
      current = touch(scan.id, {
        skippedShots: scan.skippedShots.filter((s) => s !== shotId),
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

// ---------- Questions → JobSpec ----------

const generating = new Set<number>();

export async function finishScan(scan: Scan, home: Home, input: { answers: Record<string, string>; notes?: string | null }) {
  if (scan.status !== "clarifying") throw new HttpError(409, "This scan isn't waiting for answers.");
  const template = getTemplate(scan.trade);
  const asked = scan.focus ? template.questions.filter((q) => scan.focus!.questionIds.includes(q.id)) : template.questions;

  const answers = { ...scan.answers };
  for (const q of asked) {
    const a = input.answers[q.id];
    if (a === undefined || a === "") {
      if (!q.optional) throw new HttpError(400, `Please answer: ${q.q}`);
      continue;
    }
    if (!q.options.includes(a)) throw new HttpError(400, `"${a}" isn't an option for: ${q.q}`);
    answers[q.id] = a;
  }
  const note = input.notes?.trim() || null;
  const notes = scan.focus && note ? [scan.notes, `Reply to the pro: ${note}`].filter(Boolean).join("\n") : note ?? scan.notes;
  touch(scan.id, { answers, notes });

  if (generating.has(scan.id)) throw new HttpError(409, "Already preparing your estimate — one moment.");
  generating.add(scan.id);
  try {
    const rows = scanPhotoRows(scan.id);
    const best = bestPhotos(template, rows);
    if (!best.length) throw new HttpError(400, "Take at least one photo first.");
    const job = jobOfScan(scan.id);
    const generated = await generateSpec({
      template,
      photos: await Promise.all(best.map(async (p) => ({ shotId: p.shotId, observation: p.observation, image: { data: await readScanPhoto(p), type: p.mime as ImageType } }))),
      skippedShots: scan.skippedShots,
      answers,
      notes,
      proRequest: job?.request?.message ?? null,
    });

    const matches = matchProviders(scan.trade, home, generated, job?.declinedBy ?? []);
    const top = matches[0];
    const prev = latestSpec(scan.id);

    return db.transaction((tx) => {
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
          priceLow: top?.quote.low ?? null,
          priceHigh: top?.quote.high ?? null,
          pricedForProviderId: top?.id ?? null,
        })
        .returning()
        .get();
      const now = new Date();

      if (job) {
        // Answering a pro's "ask for more": back to their New tab with the updated spec.
        tx.update(scopeJobs).set({ specId: spec.id, status: "pending", request: null, updatedAt: now }).where(eq(scopeJobs.id, job.id)).run();
        tx.update(scans).set({ status: "submitted", focus: null, focusDone: [], updatedAt: now }).where(eq(scans.id, scan.id)).run();
      } else if (spec.confidence < HANDOFF_CONFIDENCE) {
        // Low confidence: a human reviews it, with the spec attached.
        tx.insert(scopeJobs)
          .values({ scanId: scan.id, specId: spec.id, status: "handoff", providerId: top?.id ?? virtualPartner(scan.trade)?.id ?? null })
          .run();
        tx.update(scans).set({ status: "submitted", updatedAt: now }).where(eq(scans.id, scan.id)).run();
      } else {
        tx.update(scans).set({ status: "spec_ready", updatedAt: now }).where(eq(scans.id, scan.id)).run();
      }
      return spec;
    });
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

export function book(scan: Scan, home: Home, providerId: number, slot?: string) {
  const requestedSlot = slot ? parseSlot(slot) : null;
  const spec = latestSpec(scan.id);
  if (!spec) throw new HttpError(409, "There's no estimate to book yet.");
  const job = jobOfScan(scan.id);
  if (!job && scan.status !== "spec_ready") throw new HttpError(409, "This scan can't be booked right now.");
  const match = matchProviders(scan.trade, home, spec, job?.declinedBy ?? []).find((m) => m.id === providerId);
  if (!match) throw new HttpError(400, "That pro doesn't cover this job.");

  if (job) {
    moveJob(job, ["declined"], { providerId, status: "pending", specId: spec.id, mode: "onsite", requestedSlot });
  } else {
    db.insert(scopeJobs).values({ scanId: scan.id, specId: spec.id, providerId, status: "pending", requestedSlot }).run();
  }
  db.update(jobSpecs).set({ priceLow: match.quote.low, priceHigh: match.quote.high, pricedForProviderId: providerId }).where(eq(jobSpecs.id, spec.id)).run();
  touch(scan.id, { status: "submitted" });
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
  if (job) moveJob(job, ["declined", "handoff"], set);
  else if (scan.status === "spec_ready") db.insert(scopeJobs).values({ scanId: scan.id, ...set }).run();
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

export function rate(scan: Scan, stars: number) {
  const job = jobOfScan(scan.id);
  if (!job || job.status !== "done") throw new HttpError(409, "You can rate the job once it's done.");
  if (db.select().from(ratings).where(eq(ratings.jobId, job.id)).get()) throw new HttpError(409, "You've already rated this job.");
  db.transaction((tx) => {
    tx.insert(ratings).values({ jobId: job.id, stars }).run();
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
  if (job) moveJob(job, ["pending", "handoff", "virtual_call", "more_info", "declined"], { status: "cancelled" });
  else if (scan.status === "cancelled") return;
  touch(scan.id, { status: "cancelled", focus: null });
}

export type { MoreInfoRequest };
