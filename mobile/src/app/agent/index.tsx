import { Text, View } from "react-native";
import useSWR from "swr";
import type { AgentQueue, Job } from "@shared/api-types";
import { JobRow } from "@/components/JobParts";
import { EmptyState, ErrorText, Heading, Muted, Screen, Spinner } from "@/components/ui";
import { colors } from "@/lib/theme";

function Section({ title, hint, jobs, empty }: { title: string; hint?: string; jobs: Job[]; empty: string }) {
  return (
    <View style={{ gap: 10 }}>
      <View>
        <Heading>
          {title} <Text style={{ color: colors.ink40 }}>({jobs.length})</Text>
        </Heading>
        {hint && <Muted>{hint}</Muted>}
      </View>
      {jobs.length === 0 ? <EmptyState title={empty} /> : jobs.map((j) => <JobRow key={j.id} job={j} href={`/agent/jobs/${j.id}`} />)}
    </View>
  );
}

export default function AgentHome() {
  const { data, error, mutate, isValidating } = useSWR<AgentQueue>("/api/jobs", { refreshInterval: 5000 });
  if (error && !data) return <Screen><ErrorText>{error.message}</ErrorText></Screen>;
  if (!data) return <Spinner />;
  return (
    <Screen onRefresh={mutate} refreshing={isValidating} style={{ gap: 24 }}>
      <Section
        title="Needs a human"
        hint="Customers who asked for an agent, and open jobs no pro has taken for 15+ minutes."
        jobs={data.queue}
        empty="Queue is clear"
      />
      <Section title="In flight" jobs={data.active} empty="No other active jobs" />
      {data.done.length > 0 && <Section title="Recently closed" jobs={data.done} empty="" />}
    </Screen>
  );
}
