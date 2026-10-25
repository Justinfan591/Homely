import "server-only";

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
