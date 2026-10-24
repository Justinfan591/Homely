import { route, toId } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { jobDetail, loadJobFor, matchingProviders } from "@/lib/jobs";
import { intakeSteps } from "@/lib/intake/agent";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireApiUser();
  const job = loadJobFor(user, toId(id));
  return {
    ...jobDetail(user, job),
    // The intake chat is between the customer and the AI; staff can read it too.
    intake: user.role === "provider" ? [] : intakeSteps(job.id),
    candidates:
      user.role === "agent"
        ? matchingProviders(job).map(({ user: u, profile }) => ({
            id: u.id,
            name: u.name,
            businessName: profile.businessName,
            rating: profile.ratingAvg,
            jobsDone: profile.jobsDone,
          }))
        : [],
  };
});
