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
