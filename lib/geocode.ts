import "server-only";
import type { AddressSuggestion } from "@/shared/scope";

export const DEMO_CENTER = { lat: Number(process.env.DEMO_LAT) || 45.5019, lng: Number(process.env.DEMO_LNG) || -73.5674 };

/**
 * Address → coordinates with OpenStreetMap's free geocoder (no key; max ~1 request/second).
 * Falls back to the demo centre when it can't be found or the service is down, so sign-up never blocks on it.
 */
export async function geocode(address: string): Promise<{ lat: number; lng: number; found: boolean }> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Scope home-repair demo (https://github.com/)", "Accept-Language": "en" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const [hit] = (await res.json()) as { lat: string; lon: string }[];
      if (hit) return { lat: Number(hit.lat), lng: Number(hit.lon), found: true };
    }
  } catch (err) {
    console.warn("Geocoding failed; using the demo location", err);
  }
  return { ...DEMO_CENTER, found: false };
}

type NominatimAddress = Partial<Record<"house_number" | "road" | "city" | "town" | "village" | "municipality" | "state", string>>;

/** Coordinates → "12 Main St, Toronto" with OpenStreetMap. Null when nothing is found or the service is down. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Scope home-repair demo (https://github.com/)", "Accept-Language": "en" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const { address: a } = (await res.json()) as { address?: NominatimAddress };
    if (!a) return null;
    const street = [a.house_number, a.road].filter(Boolean).join(" ");
    const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.state;
    return [street, city].filter(Boolean).join(", ") || null;
  } catch (err) {
    console.warn("Reverse geocoding failed", err);
    return null;
  }
}

export type { AddressSuggestion };

type PhotonProps = Partial<Record<"name" | "housenumber" | "street" | "city" | "town" | "village" | "district" | "state" | "country" | "postcode", string>>;
type PhotonFeature = { properties: PhotonProps; geometry: { coordinates: [number, number] } };

const searchCache = new Map<string, AddressSuggestion[]>();

/**
 * Address type-ahead with Photon (komoot's free OpenStreetMap search, built for autocomplete; no key).
 * Results lean towards `near` (the homeowner's area). Empty when the service is down, so typing still works.
 */
export async function searchAddresses(query: string, near: { lat: number; lng: number } = DEMO_CENTER): Promise<AddressSuggestion[]> {
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < 3) return [];
  const key = `${q.toLowerCase()}|${near.lat.toFixed(1)},${near.lng.toFixed(1)}`;
  const cached = searchCache.get(key);
  if (cached) return cached;
  try {
    const params = new URLSearchParams({ q, limit: "8", lang: "en", lat: String(near.lat), lon: String(near.lng) });
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
      headers: { "User-Agent": "Scope home-repair demo (https://github.com/)" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const { features = [] } = (await res.json()) as { features?: PhotonFeature[] };
    const seen = new Set<string>();
    const out: AddressSuggestion[] = [];
    for (const f of features) {
      const p = f.properties;
      const street = [p.housenumber, p.street].filter(Boolean).join(" ");
      const line1 = street || p.name;
      const city = p.city ?? p.town ?? p.village ?? p.district;
      if (!line1) continue;
      const address = [line1, city].filter(Boolean).join(", ");
      if (seen.has(address.toLowerCase())) continue;
      seen.add(address.toLowerCase());
      const line2 = [city !== line1 ? city : null, p.state, p.country !== "Canada" ? p.country : null].filter(Boolean).join(", ");
      out.push({ address, line1, line2, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] });
      if (out.length === 5) break;
    }
    if (searchCache.size > 500) searchCache.clear();
    searchCache.set(key, out);
    return out;
  } catch (err) {
    console.warn("Address search failed", err);
    return [];
  }
}
