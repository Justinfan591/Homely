import { Stack, router, useLocalSearchParams } from "expo-router";
import { Linking, StyleSheet, Text, View } from "react-native";
import { MessageThread, Timeline, useJob } from "@/components/JobParts";
import { PhotoGallery } from "@/components/Photos";
import { ReportCard } from "@/components/ReportCard";
import { Button, Card, ErrorText, Heading, LinkText, Muted, Screen, Spinner, StatusBadge } from "@/components/ui";
import { colors } from "@/lib/theme";
import { useAction } from "@/lib/useAction";

const NEXT: Record<string, { to: string; label: string }[]> = {
  assigned: [
    { to: "en_route", label: "I'm on my way" },
    { to: "in_progress", label: "Start work" },
  ],
  en_route: [{ to: "in_progress", label: "I've arrived — start work" }],
  in_progress: [{ to: "completed", label: "Mark job complete" }],
};

export default function ProviderJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, error, mutate } = useJob(Number(id));
  const { busy, error: actionError, run } = useAction(mutate);

  if (error && !job) {
    return (
      <Screen>
        <Card>
          <Heading>This job isn't available.</Heading>
          <Muted>
            Another pro may have accepted it. <LinkText title="Back to jobs" onPress={() => router.navigate("/provider" as never)} />
          </Muted>
        </Card>
      </Screen>
    );
  }
  if (!job) return <Spinner />;

  const mine = job.job.providerId === job.viewer.id;
  const { status, report } = job.job;
  const photoUrl = (pid: number) => job.photos.find((p) => p.id === pid)?.url;
  const phone = mine ? job.customer?.phone : null;

  return (
    <Screen>
      <Stack.Screen options={{ title: `Job #${job.job.id}` }} />
      <View style={st.top}>
        <Text style={st.title}>{report?.title ?? "Job"}</Text>
        <StatusBadge status={status} />
      </View>

      <Card>
        <View style={{ gap: 2 }}>
          <Muted style={{ color: colors.ink50 }}>Customer</Muted>
          <Text style={st.value}>
            {job.customer?.name}
            {phone ? (
              <>
                {" · "}
                <LinkText title={phone} onPress={() => Linking.openURL(`tel:${phone}`)} />
              </>
            ) : null}
          </Text>
        </View>
        <View style={{ gap: 2 }}>
          <Muted style={{ color: colors.ink50 }}>Location</Muted>
          <Text style={st.value}>{job.job.address}</Text>
        </View>

        {status === "open" && <Button title="Accept job" large loading={busy === "accept"} onPress={() => run("accept", `/api/jobs/${job.job.id}/accept`)} />}
        {mine && NEXT[status] && (
          <View style={{ gap: 8 }}>
            {NEXT[status].map((n, i) => (
              <Button
                key={n.to}
                title={n.label}
                variant={i === 0 ? "primary" : "secondary"}
                loading={busy === n.to}
                disabled={!!busy}
                onPress={() => run(n.to, `/api/jobs/${job.job.id}/status`, { to: n.to })}
              />
            ))}
          </View>
        )}
        <ErrorText>{actionError}</ErrorText>
      </Card>

      {report && <ReportCard report={report} photoUrl={photoUrl} />}

      <Card>
        <Heading>All photos</Heading>
        <PhotoGallery photos={job.photos} />
      </Card>

      {(mine || status !== "open") && (
        <MessageThread jobId={job.job.id} viewerId={job.viewer.id} disabledReason={mine ? undefined : "Accept the job to message the customer."} />
      )}

      {mine && (
        <Card>
          <Heading>Timeline</Heading>
          <Timeline events={job.events} />
        </Card>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  title: { flex: 1, fontSize: 20, fontWeight: "700", color: colors.ink },
  value: { fontSize: 15, fontWeight: "500", color: colors.ink },
});
