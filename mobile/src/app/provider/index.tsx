import { router } from "expo-router";
import { View } from "react-native";
import useSWR from "swr";
import type { ProviderBoard } from "@shared/api-types";
import { JobRow } from "@/components/JobParts";
import { EmptyState, ErrorText, Heading, LinkText, Muted, Notice, Screen, Spinner } from "@/components/ui";
import { colors } from "@/lib/theme";

export default function ProviderHome() {
  const { data, error, mutate, isValidating } = useSWR<ProviderBoard>("/api/jobs", { refreshInterval: 5000 });
  if (error && !data) return <Screen><ErrorText>{error.message}</ErrorText></Screen>;
  if (!data) return <Spinner />;

  const active = data.mine.filter((j) => !["completed", "cancelled"].includes(j.status));
  const past = data.mine.filter((j) => ["completed", "cancelled"].includes(j.status));

  return (
    <Screen onRefresh={mutate} refreshing={isValidating}>
      {!data.profileComplete && (
        <Notice tone="warn">
          <Muted style={{ color: colors.amber900 }}>
            <Muted style={{ color: colors.amber900, fontWeight: "600" }}>Finish your profile to see jobs. </Muted>
            Add the trades you do and the ZIP codes you serve.{" "}
            <LinkText title="Set up profile →" onPress={() => router.push("/provider/profile" as never)} style={{ color: colors.amber900, textDecorationLine: "underline" }} />
          </Muted>
        </Notice>
      )}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Heading style={{ fontSize: 20 }}>Available near you</Heading>
          <Muted style={{ fontSize: 12 }}>● Live</Muted>
        </View>
        {data.available.length === 0 ? (
          <EmptyState title="No open jobs right now">New jobs that match your trades and area show up here automatically.</EmptyState>
        ) : (
          data.available.map((j) => <JobRow key={j.id} job={j} href={`/provider/jobs/${j.id}`} />)
        )}
      </View>

      <View style={{ gap: 10 }}>
        <Heading>My jobs</Heading>
        {active.length === 0 ? <Muted>Jobs you accept will appear here.</Muted> : active.map((j) => <JobRow key={j.id} job={j} href={`/provider/jobs/${j.id}`} />)}
      </View>

      {past.length > 0 && (
        <View style={{ gap: 10 }}>
          <Heading style={{ color: colors.ink60 }}>Past jobs</Heading>
          {past.map((j) => (
            <JobRow key={j.id} job={j} href={`/provider/jobs/${j.id}`} faded />
          ))}
        </View>
      )}
    </Screen>
  );
}
