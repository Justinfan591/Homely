// Run: npx tsx lib/pricing.test.ts
import assert from "node:assert/strict";
import type { JobReport } from "@/shared/types";
import { DEFAULT_RATE_CARD, priceRange } from "./pricing";

const report = (r: Partial<JobReport>) => ({ urgency: "soon", ...r }) as JobReport;

// (150 + 40 × 10) × 1.5 = 825
assert.deepEqual(priceRange(report({ severity: 4, affected_area_m2: 10 }), DEFAULT_RATE_CARD), { price: 825, low: 701, high: 949 });
// No area, no severity: base × urgency fallback (soon → 3 → 1.2)
assert.equal(priceRange(report({ affected_area_m2: null }), DEFAULT_RATE_CARD).price, 180);
// A different rate card changes the price
assert.equal(priceRange(report({ severity: 1 }), { base: 100, per_m2: 0, severity_multiplier: [1, 1, 1, 1, 1] }).price, 100);
console.log("pricing ok");
