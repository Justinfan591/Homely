import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Job, User } from "@/db/schema";
import { getProfile, providerMatches } from "./jobs";
import { DEFAULT_RATE_CARD, priceRange } from "./pricing";

const { jobs, users, photos } = schema;

/** The /pro dashboard has no sign-in: the provider comes from `?provider=<user id>`. */
export function proProvider(id: unknown) {
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  const profile = user?.role === "provider" ? getProfile(user.id) : undefined;
  if (!user || !profile) return null;
  return { user, profile, card: profile.rateCard ?? DEFAULT_RATE_CARD };
}
export type Pro = NonNullable<ReturnType<typeof proProvider>>;

export function allProviders() {
  return db
    .select({ id: users.id, name: users.name, businessName: schema.providerProfiles.businessName })
    .from(users)
    .innerJoin(schema.providerProfiles, eq(schema.providerProfiles.userId, users.id))
    .orderBy(asc(users.id))
    .all();
}

export type ProJob = Job & { report: NonNullable<Job["report"]> };
const ACTIVE = ["assigned", "en_route", "in_progress"];

// ponytail: scans every job on each request; add WHERE clauses per tab if the table gets big.
export function proQueue({ user, profile }: Pro) {
  const rows = db
    .select()
    .from(jobs)
    .where(inArray(jobs.status, ["open", "agent_review", "more_info", ...ACTIVE, "completed", "cancelled"] as Job["status"][]))
    .orderBy(desc(jobs.updatedAt))
    .all()
    .filter((j): j is ProJob => !!j.report);
  const mine = (j: Job) => j.providerId === user.id;
  const fits = (j: Job) => providerMatches(profile, j) && !j.declinedBy.includes(user.id);
  const lowConfidence = (j: ProJob) => j.report.confidence === "low";
  return {
    new: rows.filter(
      (j) => (j.status === "open" && fits(j) && !lowConfidence(j)) || (j.status === "more_info" && j.moreInfo?.providerId === user.id),
    ),
    review: rows.filter((j) => fits(j) && (j.status === "agent_review" || (j.status === "open" && lowConfidence(j)))),
    active: rows.filter((j) => mine(j) && ACTIVE.includes(j.status)),
    done: rows.filter((j) => mine(j) && (j.status === "completed" || j.status === "cancelled")),
  };
}
export type Tab = keyof ReturnType<typeof proQueue>;

export function jobPhotos(jobId: number) {
  return db.select().from(photos).where(eq(photos.jobId, jobId)).orderBy(asc(photos.id)).all();
}

export function customerOf(job: Job): User | undefined {
  return db.select().from(users).where(eq(users.id, job.customerId)).get();
}

export const priceFor = (job: ProJob, pro: Pro) => priceRange(job.report, pro.card);

/** Three fixed slots: tomorrow 9:00 and 13:00, the day after at 10:00. */
export function slotOptions(now = new Date()) {
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  return [at(1, 9), at(1, 13), at(2, 10)];
}

/** A prefilled "add to Google Calendar" link. No OAuth needed. */
export function googleCalendarUrl(job: ProJob, slot: Date, businessName: string) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const end = new Date(slot.getTime() + 2 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${businessName}: ${job.report.title}`,
    dates: `${fmt(slot)}/${fmt(end)}`,
    details: `Molsters job #${job.id}\n\n${job.report.summary}`,
    location: job.virtualCall ? "Virtual call" : job.address,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
