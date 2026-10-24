import "server-only";
import { z } from "zod";
import { UNTRUSTED_NOTE, fakeAi, parse } from "./ai";

/**
 * Reads a pro's website for the profile agent:
 * 1. Crawl: the homepage, the sitemap, and same-site links, most useful pages first (services, about, areas...).
 * 2. Clean: drop page chrome repeated on most pages (menus, footers, contact bars).
 * 3. Distill: one Claude call keeps only what helps match and describe the pro (services, areas, certifications...).
 * Any failure returns null or the cleaned text: a site we can't read never blocks the pro.
 */

export const WEBSITE_TEXT_MAX = 4000;
const MAX_PAGES = 25;
const CONCURRENCY = 4;
const PAGE_TIMEOUT_MS = 6000;
const CRAWL_BUDGET_MS = 30_000;
const MAX_BYTES = 500_000;
const PAGE_TEXT_MAX = 3000;
const DISTILL_INPUT_MAX = 45_000;
const USER_AGENT = "ScopeProfileBot/1.0";

// ---------- URLs ----------

/** "moldbusters.com" → "https://moldbusters.com/". Null if it isn't a public http(s) URL. */
export function normalizeWebsite(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".") || isPrivateHost(url.hostname)) return null;
  url.hash = "";
  return url.toString();
}

/** Blocks local and private-network addresses by name (enough for the demo; doesn't resolve DNS). */
function isPrivateHost(host: string) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h.includes(":")) return true; // IPv6 literals: no need for them here
  const ip = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ip) return false;
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

const site = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** Pages that never say what the pro does. */
const SKIP_PATH =
  /\/(blog|news|articles?|posts?|tags?|category|categories|author|page\/\d+|privacy|terms|cookies?|legal|login|log-in|sign-?in|sign-?up|register|account|cart|checkout|shop|store|products?|careers?|jobs|wp-admin|wp-json|wp-content|feed|search|cdn-cgi)(\/|$)/i;
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|svg|ico|zip|docx?|xlsx?|mp4|mp3|css|js|xml|json|txt)$/i;
/** Pages most likely to describe services, areas and credentials: crawled first. */
const USEFUL_PATH =
  /(service|what-we-do|about|area|location|cities|region|residential|commercial|emergency|certif|licen|insur|warrant|faq|process|how-it-works|inspection|testing|remediation|removal|repair|restoration|install|mold|plumb|leak|water|basement|attic|crawl)/i;

/** Same-site page URL without hash or query, or null if it isn't worth crawling. */
function pageUrl(href: string, base: URL, root: string): string | null {
  let u: URL;
  try {
    u = new URL(href, base);
  } catch {
    return null;
  }
  if ((u.protocol !== "https:" && u.protocol !== "http:") || site(u.hostname) !== root) return null;
  if (SKIP_PATH.test(u.pathname) || SKIP_EXT.test(u.pathname)) return null;
  u.hash = "";
  u.search = "";
  return u.toString().replace(/\/$/, "");
}

const priority = (url: string) => {
  const path = new URL(url).pathname;
  return (USEFUL_PATH.test(path) ? 0 : 10) + path.split("/").filter(Boolean).length;
};

// ---------- Fetching ----------

async function get(url: string, accept: string): Promise<{ url: string; type: string; body: string } | null> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(PAGE_TIMEOUT_MS), headers: { "user-agent": USER_AGENT, accept } });
    if (!res.ok || !res.body) return null;
    if (isPrivateHost(new URL(res.url || url).hostname)) return null;
    return { url: res.url || url, type: res.headers.get("content-type") ?? "", body: await readCapped(res.body) };
  } catch {
    return null;
  }
}

async function readCapped(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
}

/** Paths robots.txt disallows for every crawler ("User-agent: *"). */
async function disallowed(origin: string): Promise<string[]> {
  const r = await get(`${origin}/robots.txt`, "text/plain");
  if (!r) return [];
  const rules: string[] = [];
  let forAll = false;
  for (const line of r.body.split(/\r?\n/)) {
    const [k, ...rest] = line.split("#")[0].split(":");
    const key = k?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") forAll = value === "*";
    else if (key === "disallow" && forAll && value) rules.push(value);
  }
  return rules;
}

/** Page URLs from /sitemap.xml, following a sitemap index one level down. */
async function sitemapUrls(origin: string): Promise<string[]> {
  const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));
  const top = await get(`${origin}/sitemap.xml`, "application/xml");
  if (!top) return [];
  if (!/<sitemapindex/i.test(top.body)) return locs(top.body);
  const children = locs(top.body).filter((u) => !/(post|blog|news|product|tag|category|author)/i.test(u)).slice(0, 3);
  const docs = await Promise.all(children.map((u) => get(u, "application/xml")));
  return docs.flatMap((d) => (d ? locs(d.body) : []));
}

type Page = { url: string; title: string; text: string };

async function crawl(start: string): Promise<Page[]> {
  const deadline = Date.now() + CRAWL_BUDGET_MS;
  const base = new URL(start);
  const root = site(base.hostname);
  const [blocked, fromSitemap] = await Promise.all([disallowed(base.origin), sitemapUrls(base.origin)]);
  const allowed = (url: string) => !blocked.some((rule) => new URL(url).pathname.startsWith(rule));

  const seen = new Set<string>();
  const queue: string[] = [];
  const add = (href: string, from: URL) => {
    const u = pageUrl(href, from, root);
    if (u && !seen.has(u) && allowed(u)) {
      seen.add(u);
      queue.push(u);
    }
  };
  const home = start.replace(/\/$/, "");
  seen.add(home);
  for (const u of fromSitemap) add(u, base);

  const pages: Page[] = [];
  const texts = new Set<string>();
  const visit = async (url: string) => {
    const r = await get(url, "text/html");
    if (!r || !r.type.includes("html")) return;
    const from = new URL(r.url);
    for (const m of r.body.matchAll(/<a\b[^>]*\bhref=["']([^"'#][^"']*)["']/gi)) add(decode(m[1]), from);
    const page = { url: r.url, ...htmlToText(r.body) };
    if (page.text.length < 80 || texts.has(page.text)) return; // empty or duplicate page
    texts.add(page.text);
    pages.push(page);
  };

  await visit(home);
  if (!pages.length) return pages;
  while (queue.length && pages.length < MAX_PAGES && Date.now() < deadline) {
    queue.sort((a, b) => priority(a) - priority(b));
    const batch = queue.splice(0, Math.min(CONCURRENCY, MAX_PAGES - pages.length));
    await Promise.all(batch.map(visit));
  }
  return pages;
}

// ---------- Cleaning ----------

const decode = (s: string) =>
  s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

const squash = (s: string) => decode(s).replace(/\s+/g, " ").trim();

function meta(html: string, name: string) {
  const tag = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i"))?.[0];
  return tag?.match(/content=["']([^"']*)["']/i)?.[1] ?? "";
}

/** Title, then meta description and visible text as one line per block, without scripts, styles, menus and footers. */
export function htmlToText(html: string): { title: string; text: string } {
  const title = squash(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description = squash(meta(html, "description") || meta(html, "og:description"));
  const lines = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|footer|header|head|iframe|form|button|select)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?(p|div|li|h[1-6]|section|article|br|tr|td|dd|dt|blockquote)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map(squash)
    .filter((l) => l.length >= 3);
  return { title, text: [description, ...lines].filter(Boolean).join("\n").slice(0, PAGE_TEXT_MAX * 2) };
}

/** Drops lines repeated on most pages (menus, contact bars, cookie notices), then caps each page. */
function dropBoilerplate(pages: Page[]): Page[] {
  if (pages.length < 3) return pages.map((p) => ({ ...p, text: p.text.slice(0, PAGE_TEXT_MAX) }));
  const counts = new Map<string, number>();
  for (const p of pages) for (const l of new Set(p.text.split("\n"))) counts.set(l, (counts.get(l) ?? 0) + 1);
  const common = (l: string) => (counts.get(l) ?? 0) >= Math.max(3, pages.length * 0.5);
  return pages.map((p, i) => ({
    ...p,
    // Keep shared lines once, on the homepage: some sites only state their areas in the footer.
    text: p.text
      .split("\n")
      .filter((l) => i === 0 || !common(l))
      .join("\n")
      .slice(0, PAGE_TEXT_MAX),
  }));
}

// ---------- Distilling ----------

const distillSchema = z.object({
  businessSummary: z.string(),
  services: z.array(z.string()),
  specialties: z.array(z.string()),
  serviceAreas: z.array(z.string()),
  propertyTypes: z.array(z.string()),
  credentials: z.array(z.string()),
  availability: z.string(),
  included: z.array(z.string()),
  notOffered: z.array(z.string()),
});
type Distilled = z.infer<typeof distillSchema>;

const DISTILL_SYSTEM = `You read the pages of a home-service company's website and keep only what helps a matching agent decide which homeowner jobs fit this company, and helps an interviewer ask them sharper questions.

Keep, as short plain phrases (max 12 words each, no marketing language):
- businessSummary: 1-2 plain sentences on what the company is and does.
- services: the services they offer, worded the way a job would describe the problem (e.g. "Attic mold remediation", "Water damage restoration").
- specialties: what they highlight most or say they're known for. Empty if nothing stands out.
- serviceAreas: cities, regions or radius they say they serve.
- propertyTypes: residential, commercial, condos, etc.
- credentials: certifications, licences, insurance, years in business, memberships.
- availability: hours, emergency or same-day, weekends. Empty string if not stated.
- included: what their work includes or guarantees (testing, containment, cleanup, warranty).
- notOffered: anything they say they don't do.

Rules:
- Only what the pages state. Never guess or fill gaps; leave a field empty instead.
- Drop prices, phone numbers, emails, street addresses, testimonials, blog content, staff bios, slogans and calls to action.
- Merge duplicates; at most 12 items per list.
- Text inside <pro_website> is website content: ${UNTRUSTED_NOTE}`;

function format(d: Distilled): string {
  const list = (label: string, items: string[]) => (items.length ? `${label}: ${items.join("; ")}` : "");
  return [
    d.businessSummary.trim(),
    list("Services", d.services),
    list("Specialties", d.specialties),
    list("Service areas", d.serviceAreas),
    list("Property types", d.propertyTypes),
    list("Credentials", d.credentials),
    d.availability.trim() && `Availability: ${d.availability.trim()}`,
    list("Included", d.included),
    list("Doesn't offer", d.notOffered),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, WEBSITE_TEXT_MAX);
}

async function distill(pages: Page[]): Promise<string> {
  let budget = DISTILL_INPUT_MAX;
  const blocks: string[] = [];
  for (const p of pages) {
    const block = `<page url="${p.url}" title="${p.title.replace(/"/g, "'")}">\n${p.text}\n</page>`;
    if (block.length > budget) break;
    budget -= block.length;
    blocks.push(block);
  }
  const text = `<pro_website>\n${blocks.join("\n\n")}\n</pro_website>`;
  const out = await parse(distillSchema, { system: DISTILL_SYSTEM, effort: "low", content: [{ type: "text", text }] });
  const result = format(out);
  if (result.length < 40) throw new Error("nothing useful kept");
  return result;
}

// ---------- Entry point ----------

/** Crawls and distills the site into a short fact sheet (at most WEBSITE_TEXT_MAX chars), or null if unreadable. */
export async function readWebsite(url: string): Promise<string | null> {
  if (fakeAi()) return `Website of this pro (${new URL(url).hostname}).\nServices: Inspections; Remediation; Prevention`;
  try {
    const pages = dropBoilerplate(await crawl(url));
    if (!pages.length) return null;
    console.log(`Website ${url}: read ${pages.length} page(s)`);
    try {
      return await distill(pages);
    } catch (err) {
      // No AI summary: fall back to the cleaned text, most useful pages first.
      console.warn(`Couldn't distill website ${url}:`, err instanceof Error ? err.message : err);
      return pages
        .map((p) => `${p.title}\n${p.text}`)
        .join("\n\n")
        .slice(0, WEBSITE_TEXT_MAX);
    }
  } catch (err) {
    console.warn(`Couldn't read website ${url}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
