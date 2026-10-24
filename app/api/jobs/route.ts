import { z } from "zod";
import { and, desc, eq, inArray, lt, notInArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { route } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { getProfile, logEvent, providerMatches } from "@/lib/jobs";

const { jobs } = schema;

const createBody = z.object({
  address: z.string().trim().min(3).max(200),
  zip: z.string().trim().regex(/^\d{5}$/, "Enter a 5-digit ZIP code."),
  description: z.string().trim().max(1000).optional(),
});

export const POST = route(async (req) => {
  const user = await requireApiUser("customer");
  const data = createBody.parse(await req.json());
  const job = db
    .insert(jobs)
    .values({ customerId: user.id, address: data.address, zip: data.zip, initialDescription: data.description || null })
    .returning()
    .get();
  logEvent(job.id, user.id, "intake", "Request started");
  return { id: job.id };
});

const UNCLAIMED_AFTER_MS = 15 * 60 * 1000;

export const GET = route(async () => {
  const user = await requireApiUser();

  if (user.role === "customer") {
    return { jobs: db.select().from(jobs).where(eq(jobs.customerId, user.id)).orderBy(desc(jobs.updatedAt)).all() };
  }

  if (user.role === "provider") {
    const profile = getProfile(user.id);
    const open = db.select().from(jobs).where(eq(jobs.status, "open")).orderBy(desc(jobs.updatedAt)).all();
    return {
      available: profile ? open.filter((j) => providerMatches(profile, j)) : [],
      mine: db.select().from(jobs).where(eq(jobs.providerId, user.id)).orderBy(desc(jobs.updatedAt)).all(),
      profileComplete: !!profile && profile.trades.length > 0 && profile.zips.length > 0,
    };
  }

  // Agent: jobs needing a human, plus everything else in flight.
  const staleOpen = new Date(Date.now() - UNCLAIMED_AFTER_MS);
  const queue = db
    .select()
    .from(jobs)
    .where(or(eq(jobs.status, "agent_review"), and(eq(jobs.status, "open"), lt(jobs.updatedAt, staleOpen))))
    .orderBy(desc(jobs.updatedAt))
    .all();
  const active = db
    .select()
    .from(jobs)
    .where(
      and(
        notInArray(jobs.status, ["completed", "cancelled"]),
        queue.length ? notInArray(jobs.id, queue.map((j) => j.id)) : undefined,
      ),
    )
    .orderBy(desc(jobs.updatedAt))
    .all();
  const done = db
    .select()
    .from(jobs)
    .where(inArray(jobs.status, ["completed", "cancelled"]))
    .orderBy(desc(jobs.updatedAt))
    .limit(20)
    .all();
  return { queue, active, done };
});
