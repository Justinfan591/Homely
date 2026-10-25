import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Provider } from "@/db/schema";
import { quote } from "@/shared/scope";
import { getTemplate } from "./templates";

/** Data for the /pro pages beyond the request queue: Calendar, Bookings, Reviews and Analytics. */

const { scopeJobs, scans, homes, users, jobSpecs, ratings } = schema;

export type ProBooking = {
  jobId: number;
  client: string;
  /** The spec's short title, e.g. "Slow drip under the kitchen sink". */
  service: string;
  trade: string;
  status: "accepted" | "en_route" | "done";
  /** Visit time (null: still to be confirmed). */
  slot: Date | null;
  /** Visit length for the calendar: the agent's hours, 2 h at least. */
  hours: number;
  address: string;
  price: number;
  virtual: boolean;
};

const UPCOMING = ["accepted", "en_route"] as const;

function load(p: Provider, statuses: readonly ProBooking["status"][]) {
  return db
    .select()
    .from(scopeJobs)
    .innerJoin(scans, eq(scans.id, scopeJobs.scanId))
    .innerJoin(homes, eq(homes.id, scans.homeId))
    .innerJoin(users, eq(users.id, homes.customerId))
    .innerJoin(jobSpecs, eq(jobSpecs.id, scopeJobs.specId))
    .where(and(eq(scopeJobs.providerId, p.id), inArray(scopeJobs.status, [...statuses])))
    .all();
}

type Row = ReturnType<typeof load>[number];

const toBooking = (p: Provider, r: Row): ProBooking => {
  const q = quote(p.rateCard, r.job_specs);
  return {
    jobId: r.scope_jobs.id,
    client: r.users.name?.trim() || "Homeowner",
    service: r.job_specs.title,
    trade: r.scans.trade,
    status: r.scope_jobs.status as ProBooking["status"],
    slot: r.scope_jobs.slot,
    hours: Math.max(2, Math.ceil(q.hours)),
    address: r.homes.address,
    price: r.scope_jobs.price ?? q.price,
    virtual: r.scope_jobs.mode === "virtual",
  };
};

const time = (b: ProBooking) => b.slot?.getTime() ?? Number.MAX_SAFE_INTEGER;

/** Upcoming (booked, on the way) soonest first; past (done) newest first. */
export function bookings(p: Provider): { upcoming: ProBooking[]; past: ProBooking[] } {
  const all = load(p, [...UPCOMING, "done"]).map((r) => toBooking(p, r));
  return {
    upcoming: all.filter((b) => b.status !== "done").sort((a, b) => time(a) - time(b)),
    past: all.filter((b) => b.status === "done").sort((a, b) => time(b) - time(a)),
  };
}

/** Monday 00:00 of the week `offset` weeks from this one (server local time). */
export function weekStart(offset = 0, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return d;
}

/** The calendar week: this pro's visits from Monday to Sunday. */
export function calendarWeek(p: Provider, offset = 0) {
  const start = weekStart(offset);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const { upcoming, past } = bookings(p);
  const items = [...upcoming, ...past].filter((b) => b.slot && b.slot >= start && b.slot < end).sort((a, b) => time(a) - time(b));
  return { start, items };
}

export type ProReview = { jobId: number; name: string; service: string; date: Date; stars: number; tags: string[]; note: string | null };

/** Reviews of this pro's finished jobs, newest first. Homeowners appear by first name. */
export function reviews(p: Provider): ProReview[] {
  return db
    .select()
    .from(ratings)
    .innerJoin(scopeJobs, eq(scopeJobs.id, ratings.jobId))
    .innerJoin(scans, eq(scans.id, scopeJobs.scanId))
    .innerJoin(homes, eq(homes.id, scans.homeId))
    .innerJoin(users, eq(users.id, homes.customerId))
    .innerJoin(jobSpecs, eq(jobSpecs.id, scopeJobs.specId))
    .where(eq(scopeJobs.providerId, p.id))
    .all()
    .map((r) => ({
      jobId: r.scope_jobs.id,
      name: r.users.name?.trim().split(/\s+/)[0] || "Homeowner",
      service: r.job_specs.title,
      date: r.ratings.createdAt,
      stars: r.ratings.stars,
      tags: r.ratings.tags,
      note: r.ratings.note,
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

const WEEKS = 12;
const DAY = 86_400_000;

export type Analytics = {
  /** Last 12 weeks, oldest first. */
  weeks: { start: Date; revenue: number; bookings: number }[];
  kpis: { label: string; value: string; delta: string | null }[];
  /** Done jobs per weekday, Monday first (Mon–Sat). */
  days: { name: string; count: number }[];
  /** Most common jobs by trade. */
  top: { name: string; count: number }[];
};

const pct = (now: number, before: number) => (before > 0 ? `${now >= before ? "+" : "−"}${Math.abs(Math.round(((now - before) / before) * 100))}%` : null);

/** The last 12 weeks of finished jobs against the 12 before, for /pro → Analytics. */
export function analytics(p: Provider, cad: (n: number) => string): Analytics {
  const first = weekStart(-(WEEKS - 1));
  const before = new Date(first.getTime() - WEEKS * 7 * DAY);
  const done = load(p, ["done"]).map((r) => ({ ...toBooking(p, r), when: r.scope_jobs.slot ?? r.scope_jobs.updatedAt }));
  const recent = done.filter((d) => d.when >= first);
  const prior = done.filter((d) => d.when >= before && d.when < first);

  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const start = new Date(first.getTime() + i * 7 * DAY);
    const inWeek = recent.filter((d) => d.when >= start && d.when.getTime() < start.getTime() + 7 * DAY);
    return { start, revenue: inWeek.reduce((s, d) => s + d.price, 0), bookings: inWeek.length };
  });
  const revenue = recent.reduce((s, d) => s + d.price, 0);
  const priorRevenue = prior.reduce((s, d) => s + d.price, 0);
  const avg = recent.length ? revenue / recent.length : 0;
  const priorAvg = prior.length ? priorRevenue / prior.length : 0;

  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = names.map((name, i) => ({ name, count: recent.filter((d) => (d.when.getDay() + 6) % 7 === i).length }));
  const byTrade = new Map<string, number>();
  for (const d of recent) {
    const label = (() => {
      try {
        return getTemplate(d.trade).label;
      } catch {
        return d.trade;
      }
    })();
    byTrade.set(label, (byTrade.get(label) ?? 0) + 1);
  }

  return {
    weeks,
    kpis: [
      { label: "Revenue", value: cad(revenue), delta: pct(revenue, priorRevenue) },
      { label: "Bookings", value: String(recent.length), delta: pct(recent.length, prior.length) },
      { label: "Average job", value: cad(avg), delta: pct(avg, priorAvg) },
      { label: "Rating", value: p.ratingCount ? p.rating.toFixed(1) : "–", delta: null },
    ],
    days,
    top: [...byTrade].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
  };
}
