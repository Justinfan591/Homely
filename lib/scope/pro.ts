import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Provider, ScopeJob } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import {
  OFFER_MAX_PRICE,
  PRO_TABS,
  profileStatus,
  suggestedQuote,
  suggestionFor,
  type MoreInfoRequest,
  type OfferInfo,
  type ProJobDetail,
  type ProProvider,
  type ProQueueCard,
  type ProTab,
  type Slot,
} from "@/shared/scope";
import { addEvent, googleConfig } from "./calendar";
import { distanceKm, etaMinutes, slotsFor, virtualPartner } from "./matching";
import { bestPhotos, isBroadcast, jobInfo, moveJob, offerInfo, parseSlot, photoInfo, scanInfo, scanPhotoRows, specInfo } from "./service";
import { getTemplate } from "./templates";

const { providers, scopeJobs, jobSpecs, scans, homes, offers } = schema;

/** The /pro dashboard has no auth: the provider comes from ?provider=<id>. */
export function providerFromRequest(req: Request): Provider {
  return providerById(new URL(req.url).searchParams.get("provider"));
}

export function providerById(value: unknown): Provider {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Add ?provider=<id> to the URL.");
  const p = db.select().from(providers).where(eq(providers.id, id)).get();
  if (!p) throw new HttpError(404, "Provider not found.");
  return p;
}

export function providerInfo(p: Provider): ProProvider {
  return {
    id: p.id,
    name: p.name,
    trades: p.trades,
    lat: p.lat,
    lng: p.lng,
    radiusKm: p.radiusKm,
    rating: p.rating,
    ratingCount: p.ratingCount,
    rateCard: p.rateCard,
    offersVirtual: p.offersVirtual,
    description: p.description,
    profileStatus: profileStatus(p),
    profileFacts: p.profile?.stage === "complete" ? p.profile.facts : null,
  };
}

/** Jobs routed to this provider, open requests it was invited to, plus unassigned review items in its trades. */
export function canProviderSee(p: Provider, job: ScopeJob, trade: string) {
  if (job.providerId === p.id) return true;
  if (job.providerId != null || job.declinedBy.includes(p.id)) return false;
  if (isBroadcast(job)) return ["open", "more_info"].includes(job.status) && job.invited.includes(p.id);
  return ["handoff", "virtual_call"].includes(job.status) && p.trades.includes(trade);
}

function myOffer(p: Provider, jobId: number, home: { lat: number; lng: number }): OfferInfo | null {
  const o = db
    .select()
    .from(offers)
    .where(and(eq(offers.jobId, jobId), eq(offers.providerId, p.id)))
    .get();
  return o ? offerInfo(o, p, home) : null;
}

function loadJob(p: Provider, jobId: number) {
  const row = db
    .select()
    .from(scopeJobs)
    .innerJoin(scans, eq(scans.id, scopeJobs.scanId))
    .innerJoin(homes, eq(homes.id, scans.homeId))
    .innerJoin(jobSpecs, eq(jobSpecs.id, scopeJobs.specId))
    .where(eq(scopeJobs.id, jobId))
    .get();
  if (!row || !canProviderSee(p, row.scope_jobs, row.scans.trade)) throw new HttpError(404, "Job not found.");
  return { job: row.scope_jobs, scan: row.scans, home: row.homes, spec: row.job_specs };
}

export function queue(p: Provider): Record<ProTab, ProQueueCard[]> {
  const rows = db
    .select()
    .from(scopeJobs)
    .innerJoin(scans, eq(scans.id, scopeJobs.scanId))
    .innerJoin(homes, eq(homes.id, scans.homeId))
    .innerJoin(jobSpecs, eq(jobSpecs.id, scopeJobs.specId))
    .orderBy(desc(scopeJobs.updatedAt))
    .all()
    .filter((r) => canProviderSee(p, r.scope_jobs, r.scans.trade));

  const tabs = { new: [], review: [], active: [], done: [] } as Record<ProTab, ProQueueCard[]>;
  for (const r of rows) {
    const tab = (Object.keys(PRO_TABS) as ProTab[]).find((t) => (PRO_TABS[t] as readonly string[]).includes(r.scope_jobs.status));
    if (!tab) continue;
    const s = r.job_specs;
    tabs[tab].push({
      jobId: r.scope_jobs.id,
      scanId: r.scans.id,
      status: r.scope_jobs.status,
      trade: r.scans.trade,
      tradeLabel: getTemplate(r.scans.trade).label,
      title: s.title,
      severity: s.severity,
      areaM2: s.areaM2,
      confidence: s.confidence,
      quote: suggestedQuote(p.rateCard, s, suggestionFor(s, p.id)?.adjustPct),
      priceReason: suggestionFor(s, p.id)?.reason ?? null,
      distanceKm: Math.round(distanceKm(r.homes, p) * 10) / 10,
      myOffer: myOffer(p, r.scope_jobs.id, r.homes),
      invitedCount: r.scope_jobs.invited.length,
      createdAt: r.scope_jobs.createdAt.toISOString(),
      updatedAt: r.scope_jobs.updatedAt.toISOString(),
    });
  }
  return tabs;
}

export function jobDetail(p: Provider, jobId: number): ProJobDetail {
  const { job, scan, home, spec } = loadJob(p, jobId);
  const template = getTemplate(scan.trade);
  const rows = scanPhotoRows(scan.id);
  return {
    job: jobInfo(job, home),
    scan: scanInfo(scan),
    template,
    // Exact address only once the job is this provider's.
    home: job.providerId === p.id ? { address: home.address, lat: home.lat, lng: home.lng } : { address: "Shown after you accept", lat: home.lat, lng: home.lng },
    photos: photoInfo(bestPhotos(template, rows)),
    spec: specInfo(spec),
    quote: suggestedQuote(p.rateCard, spec, suggestionFor(spec, p.id)?.adjustPct),
    priceReason: suggestionFor(spec, p.id)?.reason ?? null,
    slots: withRequested(slotsFor(), job.requestedSlot),
    myOffer: myOffer(p, job.id, home),
    invitedCount: job.invited.length,
    answers: template.questions.filter((q) => scan.answers[q.id]).map((q) => ({ id: q.id, q: q.q, answer: scan.answers[q.id] })),
    calendarLink: job.providerId === p.id ? job.calendarLink : null,
    fitReason: spec.fit?.find((f) => f.providerId === p.id)?.reason ?? null,
  };
}

// ---------- Google Calendar ----------

export function saveGoogle(p: Provider, g: { refreshToken: string; calendar: string } | null) {
  db.update(providers).set({ googleRefreshToken: g?.refreshToken ?? null, googleCalendar: g?.calendar ?? null }).where(eq(providers.id, p.id)).run();
}

/** After accept: puts the visit in the pro's Google Calendar if they're connected. Returns the event link. */
export async function addToCalendar(p: Provider, jobId: number): Promise<string | null> {
  const cfg = googleConfig();
  if (!cfg || !p.googleRefreshToken) return null;
  const d = jobDetail(p, jobId);
  if (!d.job.slot) return null;
  const virtual = d.job.mode === "virtual";
  const link = await addEvent(cfg, p.googleRefreshToken, {
    summary: `${virtual ? "Virtual call" : "Visit"}: ${d.spec.title}`,
    description: [`Scope job #${d.job.id} (${d.template.label})`, d.spec.summary, d.job.price != null ? `Confirmed price: $${d.job.price}` : null].filter(Boolean).join("\n\n"),
    location: virtual ? "Virtual call" : d.home.address,
    start: new Date(d.job.slot),
    minutes: virtual ? 30 : 120,
  });
  db.update(scopeJobs).set({ calendarLink: link }).where(eq(scopeJobs.id, jobId)).run();
  return link;
}

/** The homeowner's requested time goes first, so /pro pre-selects it. */
function withRequested(slots: Slot[], requested: Date | null): Slot[] {
  if (!requested || requested.getTime() < Date.now()) return slots;
  const iso = requested.toISOString();
  return [{ id: "requested", startsAt: iso }, ...slots.filter((s) => s.startsAt !== iso)];
}

function checkPrice(price: number) {
  if (!Number.isFinite(price) || price < 1 || price > OFFER_MAX_PRICE) throw new HttpError(400, `Enter a price between $1 and $${OFFER_MAX_PRICE.toLocaleString("en-US")}.`);
  return Math.round(price);
}

/** Directly take a job that's routed to this pro or waiting for review (not an open request: send an offer there). */
export function accept(p: Provider, jobId: number, input: { slot: string; price: number }) {
  const { job } = loadJob(p, jobId);
  const price = checkPrice(input.price);
  const slot = parseSlot(input.slot);
  return moveJob(job, ["pending", "handoff", "virtual_call"], { status: "accepted", providerId: p.id, slot, eta: slot, price });
}

/** Send (or update) this pro's price and time on an open request. The homeowner sees it right away. */
export function sendOffer(p: Provider, jobId: number, input: { slot: string; price: number }) {
  const { job } = loadJob(p, jobId);
  if (job.status !== "open") throw new HttpError(409, "This request isn't taking offers right now.");
  const price = checkPrice(input.price);
  const slot = parseSlot(input.slot);
  const now = new Date();
  db.insert(offers)
    .values({ jobId, providerId: p.id, price, slot, status: "active" })
    .onConflictDoUpdate({ target: [offers.jobId, offers.providerId], set: { price, slot, status: "active", updatedAt: now } })
    .run();
  db.update(scopeJobs).set({ updatedAt: now }).where(eq(scopeJobs.id, jobId)).run();
}

export function withdrawOffer(p: Provider, jobId: number) {
  const { job } = loadJob(p, jobId);
  if (job.status !== "open") throw new HttpError(409, "This request is no longer open.");
  const done = db
    .update(offers)
    .set({ status: "withdrawn", updatedAt: new Date() })
    .where(and(eq(offers.jobId, jobId), eq(offers.providerId, p.id), inArray(offers.status, ["active", "stale"])))
    .returning()
    .get();
  if (!done) throw new HttpError(409, "You don't have an offer on this request.");
}

export function askForMore(p: Provider, jobId: number, input: MoreInfoRequest) {
  const { job, scan } = loadJob(p, jobId);
  const t = getTemplate(scan.trade);
  const shotIds = [...new Set(input.shotIds)].filter((id) => t.required_shots.some((s) => s.id === id));
  const questionIds = [...new Set(input.questionIds)].filter((id) => t.questions.some((q) => q.id === id));
  const message = input.message?.trim() || null;
  if (!shotIds.length && !questionIds.length && !message) throw new HttpError(400, "Pick at least one photo or question, or write a request.");
  // An open request stays unassigned; we just remember who asked.
  const providerId = isBroadcast(job) ? null : (job.providerId ?? p.id);
  return moveJob(job, ["open", "pending", "handoff", "virtual_call"], { status: "more_info", providerId, request: { shotIds, questionIds, message, providerId: p.id } });
}

export function decline(p: Provider, jobId: number) {
  const { job } = loadJob(p, jobId);
  const declinedBy = [...new Set([...job.declinedBy, p.id])];
  if (isBroadcast(job)) {
    // "Pass" on an open request: it stays open for everyone else.
    if (job.status !== "open") throw new HttpError(409, `This job is ${job.status.replace("_", " ")} and can't do that now.`);
    db.update(offers)
      .set({ status: "withdrawn", updatedAt: new Date() })
      .where(and(eq(offers.jobId, jobId), eq(offers.providerId, p.id), inArray(offers.status, ["active", "stale"])))
      .run();
    return moveJob(job, ["open"], { declinedBy });
  }
  return moveJob(job, ["pending", "virtual_call"], { status: "declined", providerId: p.id, declinedBy });
}

/** Needs review → hand the homeowner to the trade's virtual-call partner. */
export function routeToVirtualCall(p: Provider, jobId: number) {
  const { job, scan } = loadJob(p, jobId);
  const partner = virtualPartner(scan.trade, job.declinedBy);
  return moveJob(job, ["handoff"], { status: "virtual_call", mode: "virtual", providerId: partner?.id ?? p.id });
}

/** Active job stepper: accepted → en_route → done. Drives the homeowner's Track screen. */
export function advance(p: Provider, jobId: number, to: "en_route" | "done") {
  const { job, home } = loadJob(p, jobId);
  if (job.providerId !== p.id) throw new HttpError(403, "Accept the job first.");
  if (to === "en_route") {
    const eta = new Date(Date.now() + etaMinutes(distanceKm(home, p)) * 60 * 1000);
    return moveJob(job, ["accepted"], { status: "en_route", eta: job.mode === "virtual" ? new Date() : eta });
  }
  return moveJob(job, job.mode === "virtual" ? ["accepted", "en_route"] : ["en_route"], { status: "done", eta: null });
}

