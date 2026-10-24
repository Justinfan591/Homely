import "server-only";
import fs from "node:fs";
import path from "node:path";
import { templateSchema, type Template } from "@/shared/scope";
import { HttpError } from "@/lib/auth";

// Adding a trade = adding a JSON file to /templates.
const DIR = path.join(process.cwd(), "templates");

let cache: Map<string, Template> | null = null;

function load(): Map<string, Template> {
  const map = new Map<string, Template>();
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()) {
    const parsed = templateSchema.safeParse(JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")));
    if (!parsed.success) {
      console.error(`Skipping invalid template ${file}:`, parsed.error.message);
      continue;
    }
    const t = parsed.data;
    const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id)).size === xs.length;
    if (!ids(t.required_shots) || !ids(t.questions)) {
      console.error(`Skipping template ${file}: duplicate shot or question ids.`);
      continue;
    }
    map.set(t.trade, t);
  }
  return map;
}

export function templates(): Map<string, Template> {
  // Re-read in dev so template edits show up without a restart.
  if (!cache || process.env.NODE_ENV !== "production") cache = load();
  return cache;
}

export function getTemplate(trade: string): Template {
  const t = templates().get(trade);
  if (!t) throw new HttpError(404, `Unknown trade "${trade}".`);
  return t;
}
