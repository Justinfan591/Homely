import { sql } from "drizzle-orm";
import { toRateCard } from "../shared/scope";
import { db } from "./index";

// Locksmith was replaced by Roofing. Moves existing rows over so old scans still find their template.
// Safe to run any number of times.
const RENAMES: Record<string, { name: string; description: string }> = {
  "KeyPoint Locksmiths": {
    name: "Northline Roofing",
    description: "Residential roofers: leak repairs, missing and damaged shingles, flat roofs and full re-roofs. Emergency tarping after storms.",
  },
  "Secure Home Locks": {
    name: "Summit Roof & Gutter",
    description: "Small roof repairs and gutters: shingle patches, flashing around chimneys, gutter cleaning, repairs and downspouts. No full re-roofs.",
  },
};

export function migrateLocksmithToRoofing() {
  const swap = (trades: string[]) => [...new Set(trades.map((t) => (t === "locksmith" ? "roofing" : t)))];
  let changed = 0;
  db.transaction((tx) => {
    const rows = tx.all<{ id: number; trades: string }>(sql`SELECT id, trades FROM providers WHERE trades LIKE '%"locksmith"%'`);
    for (const r of rows) {
      tx.run(sql`UPDATE providers SET trades = ${JSON.stringify(swap(JSON.parse(r.trades)))} WHERE id = ${r.id}`);
      changed++;
    }
    for (const [from, to] of Object.entries(RENAMES)) {
      // Skip if a seeded roofer with the new name already exists (names are unique).
      const taken = tx.get<{ id: number }>(sql`SELECT id FROM providers WHERE name = ${to.name}`);
      if (!taken) changed += tx.run(sql`UPDATE providers SET name = ${to.name}, description = ${to.description} WHERE name = ${from}`).changes;
    }
    changed += tx.run(sql`UPDATE scans SET trade = 'roofing' WHERE trade = 'locksmith'`).changes;
    changed += tx.run(sql`UPDATE job_specs SET trade = 'roofing' WHERE trade = 'locksmith'`).changes;
    changed += tx.run(sql`UPDATE jobs SET category = 'roofing' WHERE category = 'locksmith'`).changes;
  });
  return changed;
}

/** Rate cards saved before the hourly model (base / per m² / severity) → call-out, hourly, parts markup, limit. */
export function migrateRateCards() {
  let changed = 0;
  db.transaction((tx) => {
    for (const r of tx.all<{ id: number; rate_card: string }>(sql`SELECT id, rate_card FROM providers WHERE rate_card LIKE '%"base"%'`)) {
      tx.run(sql`UPDATE providers SET rate_card = ${JSON.stringify(toRateCard(JSON.parse(r.rate_card)))} WHERE id = ${r.id}`);
      changed++;
    }
  });
  return changed;
}

/** Every data migration, in order. Run by `npm run db:seed` and scripts/migrate.ts. Safe to re-run. */
export function runMigrations() {
  return { roofing: migrateLocksmithToRoofing(), rateCards: migrateRateCards() };
}
