import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Job, User } from "@/db/schema";
import { route, toId } from "@/lib/api";
import { HttpError, requireApiUser } from "@/lib/auth";
import { loadJobFor } from "@/lib/jobs";

// Customers, the assigned provider and staff can message on a job.
function canMessage(user: User, job: Job) {
  return user.role !== "provider" || job.providerId === user.id;
}

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireApiUser();
  const job = loadJobFor(user, toId(id));
  if (!canMessage(user, job)) return { messages: [] };
  const rows = db
    .select({
      id: schema.messages.id,
      body: schema.messages.body,
      createdAt: schema.messages.createdAt,
      senderId: schema.users.id,
      senderName: schema.users.name,
      senderRole: schema.users.role,
    })
    .from(schema.messages)
    .innerJoin(schema.users, eq(schema.users.id, schema.messages.senderId))
    .where(eq(schema.messages.jobId, job.id))
    .orderBy(asc(schema.messages.id))
    .all();
  return { messages: rows };
});

const body = z.object({ body: z.string().trim().min(1).max(2000) });

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireApiUser();
  const job = loadJobFor(user, toId(id));
  if (!canMessage(user, job)) throw new HttpError(403, "Accept the job to message the customer.");
  db.insert(schema.messages)
    .values({ jobId: job.id, senderId: user.id, body: body.parse(await req.json()).body })
    .run();
  return { ok: true };
});
