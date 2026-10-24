import useSWR from "swr";
import { api } from "@/services";

// Thin SWR wrappers over the ScopeApi. Swap the api and these keep working.

export const useHomes = () => useSWR("homes", () => api.listHomes());

export const useRecord = (homeId: string | undefined) =>
  useSWR(homeId ? ["record", homeId] : null, () => api.listRecord(homeId!), { refreshInterval: 3000 });

export const useScan = (scanId: string) => useSWR(["scan", scanId], () => api.getScan(scanId), { revalidateOnFocus: false });

/** Polls every 2s until the job is finished. */
export const useJob = (jobId: string) =>
  useSWR(["job", jobId], () => api.getJob(jobId), {
    refreshInterval: (job) => (job?.status === "done" || job?.status === "handoff" ? 0 : 2000),
  });

export const useSpecOutcome = (scanId: string) =>
  useSWR(["outcome", scanId], () => api.getSpecOutcome(scanId), {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  });

export const useSpec = (specId: string | undefined) =>
  useSWR(specId ? ["spec", specId] : null, () => api.getSpec(specId!));
