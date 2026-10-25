// The app's 3D trade icons (public/trades, copied from mobile/assets/trades). Mirrors mobile/src/templates/art.ts.
const FILES: Record<string, string> = {
  plumbing_sink: "plumbing",
  mold: "mold",
  electrical: "electrical",
  handyman: "handyman",
  roofing: "roofing",
  painting: "painting",
  garden: "garden",
  appliances: "appliances",
};

export const tradeArt = (trade: string) => `/trades/${FILES[trade] ?? "handyman"}.png`;

/** Short names, as in the app's trade grid. */
const CATEGORY: Record<string, string> = { plumbing_sink: "Plumbing", mold: "Mold" };
export const tradeName = (trade: string, label: string) => CATEGORY[trade] ?? label;

export const allArt = Object.values(FILES).map((f) => `/trades/${f}.png`);
