import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { IntakeTranscript } from "@/components/IntakeChat";
import { MessageThread, ProviderCard, Timeline, useJob } from "@/components/JobParts";
import { PhotoGallery } from "@/components/Photos";
import { ReportCard } from "@/components/ReportCard";
import { BLANK_REPORT, ReportEditor } from "@/components/ReportEditor";
import { Button, Card, ErrorText, Heading, Muted, Screen, Segmented, Spinner, StatusBadge } from "@/components/ui";
import { confirmAction } from "@/lib/confirm";
import { colors, radius } from "@/lib/theme";
import { useAction } from "@/lib/useAction";

export default function AgentJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, error, mutate } = useJob(Number(id));
  const { busy, error: actionError, run } = useAction(mutate);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"report" | "chat">("report");

  if (error && !job) return <Screen><ErrorText>{error.message}</ErrorText></Screen>;
  if (!job) return <Spinner />;

  const { status, report } = job.job;
  const jobId = job.job.id;
  const photoUrl = (pid: number) => job.photos.find((p) => p.id === pid)?.url;
  const canAssign = status === "agent_review" || status === "open";
  const setStatus = (to: string, note?: string) => run(to, `/api/jobs/${jobId}/status`, { to, note });

  return (
    <Screen>
      <Stack.Screen options={{ title: `Job #${jobId}` }} />
      <View style={st.top}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={st.title}>{report?.title ?? "Intake in progress"}</Text>
          <Muted>
            {job.customer?.name} · {job.customer?.phone ?? "no phone"}
          </Muted>
          <Muted>
            {job.job.address} · {job.job.zip}
          </Muted>
        </View>
        <StatusBadge status={status} />
      </View>

      <Card>
        <Heading>Actions</Heading>
        {job.provider && <ProviderCard provider={job.provider} />}

        {canAssign && (
          <View style={{ gap: 8 }}>
            <Text style={st.label}>Assign a pro</Text>
            {!report ? (
              <Muted>Add a report first so we know which trade to match.</Muted>
            ) : job.candidates.length === 0 ? (
              <Muted>No active pros cover this trade in ZIP {job.job.zip}. Try editing the trade.</Muted>
            ) : (
              job.candidates.map((c) => (
                <View key={c.id} style={st.candidate}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={st.candidateName}>
                      {c.businessName ?? c.name}
                    </Text>
                    <Muted>
                      ★ {c.rating.toFixed(1)} · {c.jobsDone} jobs
                    </Muted>
                  </View>
                  <Button
                    title="Assign"
                    loading={busy === `assign-${c.id}`}
                    disabled={!!busy}
                    onPress={() => run(`assign-${c.id}`, `/api/jobs/${jobId}/assign`, { providerId: c.id })}
                  />
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ gap: 8 }}>
          {status === "agent_review" && report && (
            <Button title="Post to local pros instead" variant="secondary" loading={busy === "open"} onPress={() => setStatus("open", "Agent posted the job to local pros")} />
          )}
          {status === "open" && (
            <Button title="Take over this job" variant="secondary" loading={busy === "agent_review"} onPress={() => setStatus("agent_review", "Agent took over the job")} />
          )}
          {status === "assigned" && (
            <Button
              title="Reassign"
              variant="secondary"
              loading={busy === "agent_review"}
              onPress={async () => {
                if (await confirmAction("Remove the pro and reassign?", "Reassign")) await setStatus("agent_review", "Agent pulled the job back to reassign");
              }}
            />
          )}
          {["intake", "report_ready", "open", "agent_review", "assigned"].includes(status) && (
            <Button
              title="Cancel job"
              variant="danger"
              loading={busy === "cancelled"}
              onPress={async () => {
                if (await confirmAction("Cancel this job?", "Cancel job")) await setStatus("cancelled", "Cancelled by support");
              }}
            />
          )}
        </View>
        <ErrorText>{actionError}</ErrorText>
      </Card>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "report", label: "Report & photos" },
          { value: "chat", label: "AI conversation" },
        ]}
      />

      {tab === "report" ? (
        <>
          {report && !editing && (
            <>
              <ReportCard report={report} photoUrl={photoUrl} />
              {["report_ready", "open", "agent_review", "assigned"].includes(status) && (
                <Button title="Edit report" variant="secondary" onPress={() => setEditing(true)} />
              )}
            </>
          )}
          {editing && (
            <Card>
              <ReportEditor
                report={report ?? BLANK_REPORT}
                onCancel={() => setEditing(false)}
                onSave={async (r) => {
                  if (await run("report", `/api/jobs/${jobId}/report`, r, "PUT")) setEditing(false);
                }}
              />
            </Card>
          )}
          {!report && !editing && (
            <Card>
              <Muted>No report yet — the customer handed off before the AI finished. Check the conversation and photos, then write one.</Muted>
              {status === "agent_review" && <Button title="Write report" variant="secondary" onPress={() => setEditing(true)} />}
            </Card>
          )}
          <Card>
            <Heading>Photos</Heading>
            <PhotoGallery photos={job.photos} />
          </Card>
        </>
      ) : (
        <View style={st.transcript}>
          <IntakeTranscript steps={job.intake} />
        </View>
      )}

      <MessageThread jobId={jobId} viewerId={job.viewer.id} />

      <Card>
        <Heading>Timeline</Heading>
        <Timeline events={job.events} />
      </Card>
    </Screen>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  title: { fontSize: 20, fontWeight: "700", color: colors.ink },
  label: { fontSize: 14, fontWeight: "500", color: colors.ink },
  candidate: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12 },
  candidateName: { fontSize: 14, fontWeight: "600", color: colors.ink },
  transcript: { backgroundColor: "#eef2f0", borderRadius: radius.lg, padding: 14 },
});
