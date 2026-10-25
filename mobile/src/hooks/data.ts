import { useRef } from "react";
import useSWR from "swr";
import { api } from "@/services";
import { useSession } from "./session";

// Thin SWR wrappers over the ScopeApi. Swap the api and these keep working.

export const useHomes = () => {
  const signedIn = useSession() === "signed_in";
  return useSWR(signedIn ? "homes" : null, () => api.listHomes());
};

export const useProfile = () => {
  const signedIn = useSession() === "signed_in";
  return useSWR(signedIn ? "profile" : null, () => api.getProfile());
};

export const useRecord = (homeId: string | undefined) => {
  const signedIn = useSession() === "signed_in";
  return useSWR(signedIn && homeId ? ["record", homeId] : null, () => api.listRecord(homeId!), { refreshInterval: 3000 });
};

/**
 * A key part unique to one visit of a screen. Capture and the estimate act on what they load
 * first, so they must never start from a copy cached earlier in the session (e.g. before a pro
 * asked for more, or before a decline).
 */
const useVisit = () => useRef(Math.random().toString(36).slice(2)).current;

export const useScan = (scanId: string) => {
  const visit = useVisit();
  return useSWR(["scan", scanId, visit], () => api.getScan(scanId), { revalidateOnFocus: false });
};

/** The scan's follow-up questions (the questions agent writes them the first time). */
export const useQuestions = (scanId: string) => {
  const visit = useVisit();
  return useSWR(["questions", scanId, visit], () => api.getQuestions(scanId), { revalidateOnFocus: false });
};

/** Polls every 2s until the job is finished. */
export const useJob = (jobId: string) =>
  useSWR(["job", jobId], () => api.getJob(jobId), {
    // A handoff can still be picked up by a pro, so only stop once it's finished.
    refreshInterval: (job) => ((job?.status === "done" && job.rating != null) || job?.status === "cancelled" ? 0 : 2000),
  });

export const useSpecOutcome = (scanId: string) => {
  const visit = useVisit();
  return useSWR(["outcome", scanId, visit], () => api.getSpecOutcome(scanId), {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  });
};

export const useSpec = (specId: string | undefined) =>
  useSWR(specId ? ["spec", specId] : null, () => api.getSpec(specId!));
