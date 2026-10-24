import type { TradeId } from "@/domain/types";

// The design's 3D trade icons (mobile/assets/trades). Unknown trades fall back to the handyman's toolbox.
// require() of an image gives the bundler asset id (a number).
const ART: Record<string, number> = {
  plumbing_sink: require("../../assets/trades/plumbing.png"),
  mold: require("../../assets/trades/mold.png"),
  electrical: require("../../assets/trades/electrical.png"),
  handyman: require("../../assets/trades/handyman.png"),
  locksmith: require("../../assets/trades/locksmith.png"),
  painting: require("../../assets/trades/painting.png"),
  garden: require("../../assets/trades/garden.png"),
  appliances: require("../../assets/trades/appliances.png"),
};

/** Short category names for the trade grid and "It sounds like …" (the template title is the job, e.g. "Leaking sink"). */
const CATEGORY: Record<string, string> = {
  plumbing_sink: "Plumbing",
  mold: "Mold",
};

export const tradeArt = (trade: TradeId) => ART[trade] ?? ART.handyman;

export const tradeCategory = (trade: TradeId, fallback: string) => CATEGORY[trade] ?? fallback;

/** Every icon, in the order the floating clusters use them. */
export const allArt = [ART.plumbing_sink, ART.handyman, ART.painting, ART.locksmith, ART.mold, ART.electrical, ART.garden, ART.appliances];
