import { route } from "@/lib/api";
import { homeownerScan } from "@/lib/scope/routes";
import { ensureQuestions } from "@/lib/scope/service";

export const maxDuration = 60;

/** The follow-up questions for this scan: written by the questions agent the first time, then stored. */
export const POST = route<{ id: string }>(async (_req, { id }) => {
  const { scan, home } = await homeownerScan(id);
  return { questions: await ensureQuestions(scan, home) };
});
