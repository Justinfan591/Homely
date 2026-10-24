import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Job, JobStatus, User } from "@/db/schema";
import { HttpError, type Role } from "./auth";

const { jobs, jobEvents, providerProfiles, users, photos } = schema;

// Which roles may move a job from one status to another.
const TRANSITIONS: Record<string, Role[]> = {
  "intake>report_ready": ["customer"],
  "intake>agent_review": ["customer"],
  "report_ready>open": ["customer"],
  "report_ready>agent_review": ["customer"],
  "open>agent_review": ["customer", "agent"],
  "agent_review>open": ["agent"],
  "open>assigned": ["provider", "agent"],
  "agent_review>assigned": ["agent", "provider"],
  // "Ask for more" from the /pro dashboard; the homeowner's reply sends it back to open.
  "open>more_info": ["provider"],
  "agent_review>more_info": ["provider"],
  "more_info>open": ["customer"],
  "assigned>agent_review": ["agent"],
  "assigned>en_route": ["provider"],
  "en_route>in_progress": ["provider"],
  "assigned>in_progress": ["provider"],
  "in_progress>completed": ["provider"],
};
const CANCELLABLE: JobStatus[] = ["intake", "report_ready", "open", "agent_review", "more_info", "assigned"];

export function canTransition(from: JobStatus, to: JobStatus, role: Role) {
  if (to === "cancelled") return CANCELLABLE.includes(from) && role !== "provider";
  return TRANSITIONS[`${from}>${to}`]?.includes(role) ?? false;
}

/**
 * Moves a job to a new status. The update only applies if the job is still in
 * `from`, so two providers accepting at once can't both win.
 */
export function transition(
  job: Job,
  to: JobStatus,
  actor: User,
  opts: { note?: string; set?: Partial<Job> } = {},
): Job {
  const from = job.status;
  if (!canTransition(from, to, actor.role)) {
    throw new HttpError(409, `This job can't move from "${from}" to "${to}".`);
  }
  return db.transaction((tx) => {
    const updated = tx
      .update(jobs)
      .set({ ...opts.set, status: to, updatedAt: new Date() })
      .where(and(eq(jobs.id, job.id), eq(jobs.status, from)))
      .returning()
      .get();
    if (!updated) throw new HttpError(409, "This job was just updated by someone else. Refresh and try again.");
    tx.insert(jobEvents)
      .values({ jobId: job.id, fromStatus: from, toStatus: to, actorId: actor.id, note: opts.note })
      .run();
    if (to === "completed" && updated.providerId) {
      const profile = tx.select().from(providerProfiles).where(eq(providerProfiles.userId, updated.providerId)).get();
      if (profile) {
        tx.update(providerProfiles)
          .set({ jobsDone: profile.jobsDone + 1 })
          .where(eq(providerProfiles.userId, updated.providerId))
          .run();
      }
    }
    return updated;
  });
}

export function logEvent(jobId: number, actorId: number | null, toStatus: string, note: string) {
  db.insert(jobEvents).values({ jobId, actorId, fromStatus: toStatus, toStatus, note }).run();
}

type Profile = typeof providerProfiles.$inferSelect;

export function providerMatches(profile: Profile, job: Pick<Job, "category" | "zip">) {
  return (
    profile.active &&
    !!job.category &&
    profile.trades.includes(job.category) &&
    profile.zips.includes(job.zip)
  );
}

/** Providers whose trade and service area fit the job. Swap for geo-distance later. */
export function matchingProviders(job: Job) {
  const rows = db
    .select({ user: users, profile: providerProfiles })
    .from(providerProfiles)
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .all();
  return rows.filter((r) => providerMatches(r.profile, job));
}

export function getProfile(userId: number) {
  return db.select().from(providerProfiles).where(eq(providerProfiles.userId, userId)).get();
}

/** Loads a job and checks the user is allowed to see it. */
export function loadJobFor(user: User, jobId: number): Job {
  const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) throw new HttpError(404, "Job not found.");
  if (!canView(user, job)) throw new HttpError(403, "You don't have access to this job.");
  return job;
}

export function canView(user: User, job: Job) {
  if (user.role === "agent") return true;
  if (user.role === "customer") return job.customerId === user.id;
  // Providers see jobs assigned to them, jobs they asked more about,
  // and open or needs-review jobs that match their profile.
  if (job.providerId === user.id || job.moreInfo?.providerId === user.id) return true;
  if (job.status !== "open" && job.status !== "agent_review") return false;
  const profile = getProfile(user.id);
  return !!profile && providerMatches(profile, job);
}

function publicUser(u: User | undefined | null) {
  return u ? { id: u.id, name: u.name, phone: u.phone } : null;
}

/** Everything a job page needs, shaped for the given viewer. */
export function jobDetail(user: User, job: Job) {
  const jobPhotos = db.select().from(photos).where(eq(photos.jobId, job.id)).orderBy(asc(photos.id)).all();
  const events = db.select().from(jobEvents).where(eq(jobEvents.jobId, job.id)).orderBy(asc(jobEvents.id)).all();
  const ids = [job.customerId, job.providerId, job.agentId].filter((x): x is number => !!x);
  const people = db.select().from(users).where(inArray(users.id, ids)).all();
  const byId = (id: number | null) => people.find((p) => p.id === id);

  const provider = byId(job.providerId);
  const providerProfile = provider ? getProfile(provider.id) : undefined;
  const assignedToViewer = job.providerId === user.id;
  // Providers only get the customer's contact details once the job is theirs.
  const showCustomerContact = user.role !== "provider" || assignedToViewer;
  const customer = byId(job.customerId);

  return {
    job: {
      ...job,
      address: showCustomerContact ? job.address : `${job.zip} (full address shown after you accept)`,
    },
    photos: jobPhotos.map((p) => ({ id: p.id, label: p.label, url: `/api/photos/${p.id}` })),
    events,
    customer: showCustomerContact ? publicUser(customer) : customer ? { id: customer.id, name: customer.name.split(" ")[0], phone: null } : null,
    provider: provider
      ? {
          ...publicUser(provider),
          businessName: providerProfile?.businessName ?? null,
          rating: providerProfile?.ratingAvg ?? null,
          jobsDone: providerProfile?.jobsDone ?? 0,
        }
      : null,
    agent: publicUser(byId(job.agentId)),
    viewer: { id: user.id, role: user.role },
  };
}
export type JobDetail = ReturnType<typeof jobDetail>;
