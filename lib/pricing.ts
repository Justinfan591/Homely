// Deterministic pricing: spec fields × the provider's rate card. The AI never sets this price.
import type { JobReport } from "@/shared/types";

export type RateCard = { base: number; per_m2: number; severity_multiplier: number[] };

export const DEFAULT_RATE_CARD: RateCard = { base: 150, per_m2: 40, severity_multiplier: [1, 1, 1.2, 1.5, 2] };

const URGENCY_SEVERITY = { flexible: 2, soon: 3, emergency: 5 } as const;

/** Severity 1-5. Older reports have no severity, so fall back to their urgency. */
export function severityOf(report: JobReport) {
  return report.severity ?? URGENCY_SEVERITY[report.urgency];
}

/** (base + per_m2 × area) × severity multiplier, then ±15%. */
export function priceRange(report: JobReport, card: RateCard) {
  const mult = card.severity_multiplier[severityOf(report) - 1] ?? 1;
  const price = (card.base + card.per_m2 * (report.affected_area_m2 ?? 0)) * mult;
  return { price: Math.round(price), low: Math.round(price * 0.85), high: Math.round(price * 1.15) };
}
