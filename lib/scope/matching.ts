import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Provider } from "@/db/schema";
import { FIT_MIN, suggestedQuote, suggestionFor, type PriceSuggestion, type ProviderFit, type ProviderMatch, type Slot } from "@/shared/scope";

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
export function slotsFor(now = new Date()): Slot[] {
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

type PricedSpec = { severity: number; areaM2: number; priceSuggestions?: PriceSuggestion[] | null };

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
    quote: suggestedQuote(p.rateCard, spec, suggestionFor(spec, p.id)?.adjustPct),
    slots: slotsFor(),
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
