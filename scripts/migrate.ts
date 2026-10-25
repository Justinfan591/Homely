// Data migrations (locksmith → roofing, old rate cards → hourly rates). `npx tsx scripts/migrate.ts`. Safe to re-run.
import { runMigrations } from "../db/migrations";

const r = runMigrations();
console.log(`Locksmith → roofing: ${r.roofing} row(s). Rate cards → hourly: ${r.rateCards} provider(s).`);
