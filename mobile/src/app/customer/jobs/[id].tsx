import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { JobResponse } from "@shared/api-types";
import { IntakeChat } from "@/components/IntakeChat";
import { MessageThread, ProviderCard, Timeline, useJob } from "@/components/JobParts";
import { PhotoGallery } from "@/components/Photos";
import { ReportCard } from "@/components/ReportCard";
import { Body, Button, Card, ErrorText, Heading, LinkText, Muted, Notice, Screen, Spinner, StatusBadge, type ScreenRef } from "@/components/ui";
import { confirmAction } from "@/lib/confirm";
import { colors, radius } from "@/lib/theme";
import { useAction } from "@/lib/useAction";

function Handoff({ job, refresh }: { job: JobResponse; refresh: () => Promise<unknown> }) {
  const { busy, error, run } = useAction(refresh);
  const emergency = job.job.report?.urgency === "emergency";
  const choose = (route: "open" | "agent") => run(route, `/api/jobs/${job.job.id}/handoff`, { route });

  const option = (route: "open" | "agent", title: string, text: string, primary: boolean) => (
    <Pressable onPress={() => choose(route)} disabled={!!busy} style={[st.option, primary ? st.optionPrimary : st.optionPlain, !!busy && { opacity: 0.6 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {busy === route && <ActivityIndicator size="small" color={colors.brand700} />}
        <Text style={[st.optionTitle, primary && { color: colors.brand900 }]}>{title}</Text>
      </View>
      <Muted>{text}</Muted>
    </Pressable>
  );

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <Heading>How would you like to continue?</Heading>
        <Muted>Either way, whoever picks up the job sees this report and your photos.</Muted>
      </View>
      {emergency && (
        <Notice tone="danger">
          This looks urgent. If anyone is in danger, call 911 first. Otherwise we suggest talking to a support agent, who can get help to you quickly.
        </Notice>
      )}
      {option("open", "Find a local pro", "Send the job to nearby pros. The first one to accept gets in touch.", true)}
      {option("agent", "Talk to a support agent", "A person on our team reviews the report with you and books the right pro.", false)}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

const NEXT_STEP: Record<string, string> = {
  open: "We've sent your job to local pros nearby. You'll see their details here as soon as one accepts.",
  agent_review: "A support agent will review your report and get back to you here shortly.",
  assigned: "Your pro has the job and your report. They'll be in touch to confirm a time.",
  en_route: "Your pro is on the way.",
  in_progress: "Work is underway.",
  completed: "All done! Thanks for using Molsters.",
  cancelled: "This request was cancelled.",
};

export default function CustomerJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, error, mutate } = useJob(Number(id));
  const actions = useAction(mutate);
  const scroll = useRef<ScreenRef>(null);
  const scrollToEnd = useCallback(() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 150), []);

  if (error && !job) return <Screen><ErrorText>{error.message}</ErrorText></Screen>;
  if (!job) return <Spinner />;

  const { status, report } = job.job;
  const photoUrl = (pid: number) => job.photos.find((p) => p.id === pid)?.url;
  const canCancel = ["intake", "report_ready", "open", "agent_review", "assigned"].includes(status);

  return (
    <Screen ref={scroll}>
      <Stack.Screen options={{ title: `Request #${job.job.id}` }} />
      <View style={st.top}>
        <Text style={st.title}>{report?.title ?? "Tell us about the problem"}</Text>
        <StatusBadge status={status} />
      </View>

      {status === "intake" && (
        <>
          <IntakeChat job={job} refresh={mutate} onChange={scrollToEnd} />
          <View style={st.handoffLink}>
            <Muted style={{ textAlign: "center" }}>
              Rather talk to a person?{" "}
              <LinkText
                title="Hand this to a support agent"
                onPress={() => actions.run("agent", `/api/jobs/${job.job.id}/status`, { to: "agent_review", note: "Customer asked for a person during intake" })}
              />
            </Muted>
          </View>
        </>
      )}

      {status === "report_ready" && report && (
        <>
          <ReportCard report={report} photoUrl={photoUrl} />
          <Handoff job={job} refresh={mutate} />
        </>
      )}

      {!["intake", "report_ready"].includes(status) && (
        <>
          <Card>
            <Body>{NEXT_STEP[status]}</Body>
            {job.provider && <ProviderCard provider={job.provider} />}
            {job.agent && !job.provider && <Muted>Support agent: {job.agent.name}</Muted>}
          </Card>
          {report ? <ReportCard report={report} photoUrl={photoUrl} /> : <PhotoGallery photos={job.photos} />}
          {status !== "cancelled" && <MessageThread jobId={job.job.id} viewerId={job.viewer.id} />}
          <Card>
            <Heading>Timeline</Heading>
            <Timeline events={job.events} />
          </Card>
        </>
      )}

      <ErrorText>{actions.error}</ErrorText>
      {canCancel && (
        <Button
          title="Cancel request"
          variant="ghost"
          textStyle={{ color: colors.red700 }}
          loading={actions.busy === "cancel"}
          onPress={async () => {
            if (await confirmAction("Cancel this request?", "Cancel request")) {
              await actions.run("cancel", `/api/jobs/${job.job.id}/status`, { to: "cancelled", note: "Cancelled by customer" });
            }
          }}
        />
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  title: { flex: 1, fontSize: 20, fontWeight: "700", color: colors.ink },
  handoffLink: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  option: { borderRadius: radius.lg, borderWidth: 2, padding: 14, gap: 4 },
  optionPrimary: { borderColor: colors.brand600, backgroundColor: colors.brand50 },
  optionPlain: { borderColor: colors.borderStrong, backgroundColor: colors.white },
  optionTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
});
