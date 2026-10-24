import { useRef } from "react";
import useSWR from "swr";
import { api } from "@/services";

// Thin SWR wrappers over the ScopeApi. Swap the api and these keep working.

export const useHomes = () => useSWR("homes", () => api.listHomes());

export const useRecord = (homeId: string | undefined) =>
  useSWR(homeId ? ["record", homeId] : null, () => api.listRecord(homeId!), { refreshInterval: 3000 });

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
