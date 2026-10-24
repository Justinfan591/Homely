import type { PriceRange, RateCard } from "./types";

const RANGE = 0.15;

/**
 * Deterministic pricing: spec fields × the provider's rate card.
 * The model never produces a price. Result is the calculated price ±15%.
 */
export function priceRange(card: RateCard, areaM2: number, severity: number): PriceRange {
  const multiplier = card.severityMultiplier[Math.min(Math.max(severity, 1), card.severityMultiplier.length) - 1] ?? 1;
  const price = (card.base + card.perM2 * areaM2) * multiplier;
  return { low: roundTo5(price * (1 - RANGE)), high: roundTo5(price * (1 + RANGE)) };
}

function roundTo5(n: number) {
  return Math.round(n / 5) * 5;
}
