import { priceRange } from "./pricing";
import type { Home, JobSpec, MatchOption, Provider, Slot } from "./types";

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Filter by trade and radius, then rank by rating and ETA. */
export function matchProviders(
  providers: Provider[],
  home: Home,
  spec: Pick<JobSpec, "trade" | "areaM2" | "severity">,
  slots: Slot[],
): MatchOption[] {
  return providers
    .filter((p) => p.trades.includes(spec.trade))
    .map((provider) => ({ provider, distanceKm: distanceKm(home, provider) }))
    .filter((m) => m.distanceKm <= m.provider.radiusKm)
    .sort((a, b) => score(b.provider) - score(a.provider))
    .map(({ provider, distanceKm }) => ({
      provider,
      distanceKm,
      price: priceRange(provider.rateCard, spec.areaM2, spec.severity),
      slots,
    }));
}

// Rating dominates; each hour of ETA costs a tenth of a star.
function score(p: Provider) {
  return p.rating - p.etaMinutes / 600;
}
