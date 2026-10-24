import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import type { ScanResponse } from "@shared/scope";
import { Capture } from "@/components/scope/Capture";
import { Clarify } from "@/components/scope/Clarify";
import { SpecView } from "@/components/scope/SpecView";
import { Track } from "@/components/scope/Track";
import { BigStatus } from "@/components/scope/Parts";
import { ErrorText, Screen, Spinner } from "@/components/ui";

/** Poll every 2s while a pro might change something; otherwise only on demand. */
function pollInterval(d?: ScanResponse) {
  const s = d?.job?.status;
  if (!s || s === "cancelled" || (s === "done" && d?.job?.rating != null)) return 0;
  return 2000;
}

/** One route for the whole flow: Scan → Clarify → Spec → Track, picked from the scan's state. */
export default function ScanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const key = `/api/scans/${id}`;
  const { data, error, mutate } = useSWR<ScanResponse>(key, { refreshInterval: pollInterval });

  const refresh = useCallback(async () => {
    await mutate();
    void globalMutate("/api/home");
  }, [mutate]);

  if (error && !data) {
    return (
      <Screen>
        <ErrorText>{error.message}</ErrorText>
      </Screen>
    );
  }
  if (!data) return <Spinner />;

  const { scan, job } = data;

  if (scan.status === "capturing") {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Capture key={scan.focus ? "focus" : "full"} data={data} refresh={refresh} />
      </>
    );
  }

  let content: React.ReactNode;
  let title = data.template.label;
  if (scan.status === "clarifying") {
    title = "Questions";
    content = (
      <Clarify
        data={data}
        onDone={(next) => {
          void mutate(next, { revalidate: false });
          void globalMutate("/api/home");
        }}
      />
    );
  } else if (scan.status === "spec_ready") {
    title = "Your estimate";
    content = <SpecView data={data} refresh={refresh} />;
  } else if (job) {
    title = "Your job";
    content = <Track data={data} refresh={refresh} />;
  } else {
    content = <BigStatus title="Scan cancelled" subtitle="Start a new scan from the home screen." />;
  }

  return (
    <Screen onRefresh={refresh}>
      <Stack.Screen options={{ headerShown: true, title }} />
      {content}
    </Screen>
  );
}
