import { router } from "expo-router";
import useSWR from "swr";
import type { CustomerJobs } from "@shared/api-types";
import { JobRow } from "@/components/JobParts";
import { Button, EmptyState, ErrorText, LinkText, Muted, Screen, Spinner } from "@/components/ui";

export default function CustomerHome() {
  const { data, error, mutate, isValidating } = useSWR<CustomerJobs>("/api/jobs", { refreshInterval: 10000 });

  return (
    <Screen onRefresh={mutate} refreshing={isValidating && !!data}>
      <Muted>Track your repairs and message your pro.</Muted>
      <Button title="+ New request" onPress={() => router.push("/customer/new" as never)} large />
      {error && !data ? (
        <ErrorText>{error.message}</ErrorText>
      ) : !data ? (
        <Spinner />
      ) : data.jobs.length === 0 ? (
        <EmptyState title="Nothing here yet">
          <Muted style={{ textAlign: "center" }}>
            Got something that needs fixing? <LinkText title="Snap a photo to start." onPress={() => router.push("/customer/new" as never)} />
          </Muted>
        </EmptyState>
      ) : (
        data.jobs.map((j) => <JobRow key={j.id} job={j} href={`/customer/jobs/${j.id}`} />)
      )}
    </Screen>
  );
}
