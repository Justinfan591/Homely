import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const dbPath = path.join(process.cwd(), "data", "molsters.db");

function open() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

// Reuse one connection across hot reloads in dev.
const g = globalThis as unknown as { __db?: ReturnType<typeof open> };
export const db = g.__db ?? (g.__db = open());
export { schema };
