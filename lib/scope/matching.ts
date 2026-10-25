import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Provider } from "@/db/schema";
import { DEFAULT_HOURS, FIT_MIN, quote, type JobEstimate, type ProviderFit, type ProviderMatch, type Slot } from "@/shared/scope";

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough drive time: 10 min to get going plus ~30 km/h in town. */
export const etaMinutes = (km: number) => Math.round(10 + km * 2);

/**
 * Three bookable slots seeded from the current time (server local time):
 * the soonest round hour at least 2 hours out if it falls in business hours
 * (8:00-17:00), then the next standard slots at 9:00, 13:00 and 16:00.
 */
export function genericSlots(now = new Date()): Slot[] {
  const earliest = now.getTime() + 2 * 3600 * 1000;
  const at = (dayOffset: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const soonest = new Date(Math.ceil(earliest / 3600_000) * 3600_000);
  const list: Date[] = soonest.getHours() >= 8 && soonest.getHours() <= 17 && soonest.getDate() === now.getDate() ? [soonest] : [];
  for (let day = 0; list.length < 3; day++) {
    for (const h of [9, 13, 16]) {
      const d = at(day, h);
      if (d.getTime() >= earliest && !list.some((x) => Math.abs(x.getTime() - d.getTime()) < 3600_000) && list.length < 3) list.push(d);
    }
  }
  return list.map((d, i) => ({ id: `s${i + 1}`, startsAt: d.toISOString() }));
}

// ---------- One pro's free times (working hours minus booked jobs) ----------

const HALF_HOUR = 30 * 60 * 1000;
/** A visit blocks at least this long in the pro's calendar. */
const MIN_BLOCK_HOURS = 2;
const blockHours = (hours: number | null | undefined) => Math.max(MIN_BLOCK_HOURS, Math.ceil(hours ?? 0));
/** WeekHours is Monday first; Date.getDay() is Sunday first. */
const dayIndex = (d: Date) => (d.getDay() + 6) % 7;

/** This pro's booked visits as [start, end) times, each as long as its estimated hours (2 h at least). */
export function busyTimes(providerId: number): [number, number][] {
  return db
    .select({ slot: schema.scopeJobs.slot, hours: schema.jobSpecs.hours })
    .from(schema.scopeJobs)
    .leftJoin(schema.jobSpecs, eq(schema.jobSpecs.id, schema.scopeJobs.specId))
    .where(and(eq(schema.scopeJobs.providerId, providerId), inArray(schema.scopeJobs.status, ["accepted", "en_route"])))
    .all()
    .filter((r) => r.slot)
    .map((r) => [r.slot!.getTime(), r.slot!.getTime() + blockHours(r.hours) * 3600_000]);
}

/** Is [start, start + hours) inside the pro's working hours and clear of their bookings? */
function fits(p: Pick<Provider, "hours">, busy: [number, number][], start: Date, hours: number) {
  const week = p.hours ?? DEFAULT_HOURS;
  for (let t = start.getTime(); t < start.getTime() + hours * 3600_000; t += HALF_HOUR) {
    const d = new Date(t);
    if (!week[dayIndex(d)]?.[d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0)]) return false;
  }
  const end = start.getTime() + hours * 3600_000;
  return !busy.some(([a, b]) => start.getTime() < b && end > a);
}

/**
 * Up to three times this pro can come, inside their working hours and between their bookings:
 * on the hour, at least 2 hours from now, within a week, and at least 3 hours apart so they're real choices.
 */
export function slotsFor(p?: Pick<Provider, "id" | "hours">, job?: { hours?: number | null }, now = new Date()): Slot[] {
  if (!p) return genericSlots(now);
  const busy = busyTimes(p.id);
  const need = blockHours(job?.hours);
  const t = new Date(Math.ceil((now.getTime() + 2 * 3600_000) / 3600_000) * 3600_000);
  const out: Date[] = [];
  for (let i = 0; i < 7 * 24 && out.length < 3; i++, t.setHours(t.getHours() + 1)) {
    if (out.length && t.getTime() - out.at(-1)!.getTime() < 3 * 3600_000) continue;
    if (fits(p, busy, t, need)) out.push(new Date(t));
  }
  return out.map((d, i) => ({ id: `s${i + 1}`, startsAt: d.toISOString() }));
}

/**
 * When the pricing agent books for this pro: the homeowner's requested time if the pro is free then,
 * else the pro's first free half-hour after it (e.g. after their lunch break), else their soonest slot.
 */
export function slotNear(p: Pick<Provider, "id" | "hours">, job: { hours?: number | null }, wanted: Date | null, now = new Date()): Date | null {
  const earliest = now.getTime() + 2 * 3600_000;
  if (wanted && wanted.getTime() >= earliest) {
    const busy = busyTimes(p.id);
    const need = blockHours(job.hours);
    for (let t = wanted.getTime(); t < wanted.getTime() + 7 * 24 * 3600_000; t += HALF_HOUR) {
      if (fits(p, busy, new Date(t), need)) return new Date(t);
    }
  }
  const first = slotsFor(p, job, now)[0];
  return first ? new Date(first.startsAt) : null;
}

type PricedSpec = JobEstimate & { areaM2: number };

export function toMatch(p: Provider, home: { lat: number; lng: number }, spec: PricedSpec, fitReason: string | null = null): ProviderMatch {
  const km = distanceKm(home, p);
  return {
    fitReason,
    id: p.id,
    name: p.name,
    rating: p.rating,
    ratingCount: p.ratingCount,
    distanceKm: Math.round(km * 10) / 10,
    etaMinutes: etaMinutes(km),
    quote: quote(p.rateCard, spec),
    slots: slotsFor(p, spec),
  };
}

/** Active providers for this trade whose service radius covers the home. */
export function providersInRange(trade: string, home: { lat: number; lng: number }, exclude: number[] = []): Provider[] {
  return db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.active, true))
    .all()
    .filter((p) => p.trades.includes(trade) && !exclude.includes(p.id) && distanceKm(home, p) <= p.radiusKm);
}

/**
 * Providers for this trade within their service radius.
 * With the matching agent's `fit` (see fit.ts): its order, poor fits dropped while a better one is left.
 * Without it, or for pros it didn't rank: best rating first, then shortest ETA.
 */
export function matchProviders(
  trade: string,
  home: { lat: number; lng: number },
  spec: PricedSpec & { fit?: ProviderFit[] | null },
  exclude: number[] = [],
): ProviderMatch[] {
  const fit = spec.fit ?? [];
  const rankOf = (id: number) => {
    const i = fit.findIndex((f) => f.providerId === id);
    return i < 0 ? fit.length : i;
  };
  const matches = providersInRange(trade, home, exclude)
    .map((p) => toMatch(p, home, spec, fit.find((f) => f.providerId === p.id)?.reason ?? null))
    .sort((a, b) => rankOf(a.id) - rankOf(b.id) || b.rating - a.rating || a.etaMinutes - b.etaMinutes);
  const poor = new Set(fit.filter((f) => f.score < FIT_MIN).map((f) => f.providerId));
  const good = matches.filter((m) => !poor.has(m.id));
  return good.length ? good : matches;
}

/** Who takes virtual calls for a trade when nobody is in range (Mold Busters for mold). */
export function virtualPartner(trade: string, exclude: number[] = []): Provider | undefined {
  return db
    .select()
    .from(schema.providers)
    .where(eq(schema.providers.offersVirtual, true))
    .all()
    .filter((p) => p.active && p.trades.includes(trade) && !exclude.includes(p.id))
    .sort((a, b) => b.rating - a.rating)[0];
}
