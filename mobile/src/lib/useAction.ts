import { useState } from "react";
import { mutate as globalMutate } from "swr";
import { api } from "./api";

/** Runs one API action at a time, tracks which button is busy, and refreshes the job afterwards. */
export function useAction(refresh: () => Promise<unknown>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function run(key: string, path: string, body?: unknown, method = "POST") {
    setBusy(key);
    setError("");
    try {
      await api(path, { method, body });
      await refresh();
      void globalMutate("/api/jobs"); // keep the job list in sync
      return true;
    } catch (err) {
      setError((err as Error).message);
      await refresh().catch(() => {});
      return false;
    } finally {
      setBusy(null);
    }
  }

  return { busy, error, run };
}
