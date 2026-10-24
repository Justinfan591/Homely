import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { route, toId } from "@/lib/api";
import { HttpError, requireApiUser } from "@/lib/auth";
import { loadJobFor, logEvent } from "@/lib/jobs";
import { reportSchema } from "@/shared/types";

/** Support agents can correct the AI's report before work starts. */
export const PUT = route<{ id: string }>(async (req, { id }) => {
  const agent = await requireApiUser("agent");
  const job = loadJobFor(agent, toId(id));
  if (!["report_ready", "open", "agent_review", "assigned"].includes(job.status)) {
    throw new HttpError(409, "The report can't be edited at this stage.");
  }
  const report = reportSchema.parse(await req.json());
  db.update(schema.jobs)
    .set({ report, category: report.category, urgency: report.urgency, agentId: agent.id, updatedAt: new Date() })
    .where(eq(schema.jobs.id, job.id))
    .run();
  logEvent(job.id, agent.id, job.status, `Report edited by ${agent.name}`);
  return { ok: true };
});
