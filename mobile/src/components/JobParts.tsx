import { router } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import useSWR from "swr";
import type { Job, JobEvent, JobResponse, Message, Role } from "@shared/api-types";
import { money, timeAgo } from "@shared/format";
import { STATUS_LABELS } from "@shared/types";
import { api, fetcher } from "@/lib/api";
import { colors, radius } from "@/lib/theme";
import { Button, Card, Heading, Input, Muted, StatusBadge, TradeBadge, UrgencyBadge } from "./ui";

export function useJob(id: number) {
  return useSWR<JobResponse>(Number.isFinite(id) ? `/api/jobs/${id}` : null, fetcher, { refreshInterval: 5000 });
}

export function Timeline({ events }: { events: JobEvent[] }) {
  return (
    <View style={st.timeline}>
      {[...events].reverse().map((e) => {
        const changed = e.fromStatus !== e.toStatus;
        return (
          <View key={e.id} style={st.event}>
            <View style={st.dot} />
            <Text style={st.eventTitle}>{changed ? STATUS_LABELS[e.toStatus] ?? e.toStatus : e.note}</Text>
            {changed && e.note ? <Muted>{e.note}</Muted> : null}
            <Text style={st.eventTime}>{timeAgo(e.createdAt)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const ROLE_TAG: Record<Role, string> = { customer: "Customer", provider: "Pro", agent: "Support" };

export function MessageThread({ jobId, viewerId, disabledReason }: { jobId: number; viewerId: number; disabledReason?: string }) {
  const { data, mutate } = useSWR<{ messages: Message[] }>(`/api/jobs/${jobId}/messages`, fetcher, { refreshInterval: 5000 });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    setError("");
    try {
      await api(`/api/jobs/${jobId}/messages`, { body: { body: text } });
      setText("");
      await mutate();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  const messages = data?.messages ?? [];
  return (
    <Card>
      <Heading>Messages</Heading>
      <View style={{ gap: 8 }}>
        {messages.length === 0 && <Muted>No messages yet.</Muted>}
        {messages.map((m) => {
          const mine = m.senderId === viewerId;
          return (
            <View key={m.id} style={[st.bubble, mine ? st.bubbleMine : st.bubbleOther]}>
              {!mine && (
                <Text style={st.sender}>
                  {m.senderName} · {ROLE_TAG[m.senderRole]}
                </Text>
              )}
              <Text style={[st.msgBody, mine && { color: colors.white }]}>{m.body}</Text>
              <Text style={[st.msgTime, mine && { color: "rgba(255,255,255,0.7)" }]}>{timeAgo(m.createdAt)}</Text>
            </View>
          );
        })}
      </View>
      {disabledReason ? (
        <Muted>{disabledReason}</Muted>
      ) : (
        <View style={st.compose}>
          <Input value={text} onChangeText={setText} placeholder="Write a message…" style={{ flex: 1 }} multiline />
          <Button title="Send" onPress={send} loading={sending} disabled={!text.trim()} />
        </View>
      )}
      {error ? <Text style={{ color: colors.red700, fontSize: 13 }}>{error}</Text> : null}
    </Card>
  );
}

export function JobRow({ job, href, faded }: { job: Job; href: string; faded?: boolean }) {
  return (
    <Pressable
      onPress={() => router.push(href as never)}
      style={({ pressed }) => [st.row, faded && { opacity: 0.75 }, pressed && { borderColor: "rgba(16,185,138,0.5)" }]}
    >
      <View style={st.rowTop}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={st.rowTitle}>
            {job.report?.title ?? job.initialDescription ?? "New request"}
          </Text>
          <Text style={st.rowMeta}>
            #{job.id} · ZIP {job.zip} · {timeAgo(job.updatedAt)}
          </Text>
        </View>
        <StatusBadge status={job.status} />
      </View>
      {job.report && (
        <View style={st.rowBadges}>
          <TradeBadge trade={job.category} />
          <UrgencyBadge urgency={job.urgency} />
          <Text style={st.rowMeta}>{money(job.report.est_cost_usd)}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function ProviderCard({ provider }: { provider: NonNullable<JobResponse["provider"]> }) {
  return (
    <View style={st.provider}>
      <View style={st.avatar}>
        <Text style={st.avatarText}>{provider.name?.[0]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.rowTitle}>{provider.businessName ?? provider.name}</Text>
        <Muted>
          {provider.name} · ★ {provider.rating?.toFixed(1) ?? "–"} · {provider.jobsDone} jobs
        </Muted>
      </View>
      {provider.phone ? <Button title="Call" variant="secondary" onPress={() => Linking.openURL(`tel:${provider.phone}`)} /> : null}
    </View>
  );
}

const st = StyleSheet.create({
  timeline: { borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 18, gap: 14, marginLeft: 6 },
  event: { gap: 2 },
  dot: { position: "absolute", left: -25, top: 4, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brand500, borderWidth: 2, borderColor: colors.white },
  eventTitle: { fontSize: 14, fontWeight: "500", color: colors.ink },
  eventTime: { fontSize: 12, color: colors.ink40 },
  bubble: { maxWidth: "82%", borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 8 },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: colors.brand600 },
  bubbleOther: { alignSelf: "flex-start", backgroundColor: colors.tint },
  sender: { fontSize: 12, fontWeight: "600", color: colors.ink60, marginBottom: 2 },
  msgBody: { fontSize: 14, color: colors.ink },
  msgTime: { fontSize: 11, color: colors.ink40, marginTop: 2 },
  compose: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  row: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 },
  rowTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  rowTitle: { fontSize: 15, fontWeight: "600", color: colors.ink },
  rowMeta: { fontSize: 13, color: colors.ink50, marginTop: 2 },
  rowBadges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  provider: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand100, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "700", color: colors.brand700 },
});
