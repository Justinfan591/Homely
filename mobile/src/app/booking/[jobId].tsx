import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Skeleton } from "@/components/Controls";
import { Card, InfoRow, TradeArt } from "@/components/Design";
import { goBackOrHome, RefreshProvider, Screen } from "@/components/Screen";
import { ErrorState } from "@/components/States";
import { Text } from "@/components/Text";
import { money, moneyRange, timeOfDay, windowLabel, windowRange } from "@/domain/format";
import type { Job } from "@/domain/types";
import { useJob } from "@/hooks/data";
import { api } from "@/services";
import { radius } from "@/theme";

/** The states this screen shows; the rest have their own screens. */
const HERE: Job["status"][] = ["pending", "accepted", "en_route", "done"];

/** Client · booking details */
export default function Booking() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { data: job, error, mutate } = useJob(jobId);

  useEffect(() => {
    if (!job || HERE.includes(job.status)) return;
    if (job.status === "collecting") {
      const nobodyLeft = !job.offers?.length && (job.invitedCount ?? 0) > 0 && (job.passedCount ?? 0) >= (job.invitedCount ?? 0);
      router.replace(nobodyLeft ? `/track/${jobId}` : job.offers?.length ? `/quotes/${jobId}` : `/finding/${jobId}`);
    } else router.replace(`/track/${jobId}`);
  }, [job, jobId]);

  if (error && !job) {
    return (
      <Screen title="Booking">
        <ErrorState message={error.message} onRetry={() => mutate()} />
      </Screen>
    );
  }
  if (!job || !HERE.includes(job.status)) {
    return (
      <Screen title="Booking">
        <View style={{ gap: 12, marginTop: 16 }}>
          <Skeleton height={260} radius={radius.xl} />
          <Skeleton height={200} radius={radius.lg} />
        </View>
      </Screen>
    );
  }
  return (
    <RefreshProvider onRefresh={() => mutate()}>
      <Details job={job} onChange={() => void mutate()} />
    </RefreshProvider>
  );
}

const STATUS: Record<string, string> = {
  pending: "Waiting to confirm",
  accepted: "Confirmed",
  en_route: "On the way",
  done: "Done",
};

function Details({ job, onChange }: { job: Job; onChange: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Message Mold Busters"; a long company name is cut to its first word ("Message ClearSpore").
  const first = job.providerName.length <= 18 ? job.providerName : job.providerName.split(/[\s']/)[0];
  const canCancel = job.status === "pending" || job.status === "accepted";
  const rated = job.rating != null;

  const status = job.status === "en_route" && job.etaMinutes != null ? `On the way · ${job.etaMinutes} min` : STATUS[job.status];
  const when = job.slot ? windowLabel(job.slot.start) : "Time to be confirmed";
  const detail = job.slot ? (job.slotConfirmed ? timeOfDay(new Date(job.slot.start)) : windowRange(job.slot.start)) : null;
  const price = job.price ? (job.price.low === job.price.high ? money(job.price.low) : moneyRange(job.price)) : "To be confirmed";

  function message() {
    if (!job.providerPhone) return;
    const sep = Platform.OS === "ios" ? "&" : "?";
    void Linking.openURL(`sms:${job.providerPhone}${sep}body=${encodeURIComponent(`Hi, about my booking: ${job.title}`)}`);
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await api.cancelJob(job.id);
      onChange();
      goBackOrHome();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel. Try again.");
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Booking"
      footer={
        <>
          {error ? (
            <Text variant="caption" tone="danger" style={{ textAlign: "center" }} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          {job.status === "done" && !rated ? <Button label={`Rate ${first}`} onPress={() => router.push(`/review/${job.id}`)} /> : null}
          {job.providerPhone && job.status !== "done" ? <Button label={`Message ${first}`} onPress={message} /> : null}
          {canCancel ? (
            <Button
              label={confirming ? "Yes, cancel this booking" : "Cancel booking"}
              variant={confirming ? "danger" : "ghost"}
              loading={busy}
              onPress={() => (confirming ? cancel() : setConfirming(true))}
            />
          ) : null}
        </>
      }
    >
      <Card style={styles.hero}>
        <TradeArt trade={job.trade} size={180} float />
        <Text variant="label" tone="soft">
          {status}
        </Text>
        <Text variant="title" style={{ marginTop: 6, textAlign: "center" }}>
          {when}
        </Text>
        {detail ? (
          <Text tone="soft" style={{ marginTop: 4 }}>
            {detail}
          </Text>
        ) : null}
      </Card>
      <Card style={{ marginTop: 12, paddingVertical: 4 }}>
        <InfoRow label="Pro" value={job.providerName} />
        <InfoRow label="Job" value={job.title} />
        <InfoRow label="Where" value={job.address} />
        <InfoRow label="Price" value={price} last />
      </Card>
      {job.status === "pending" ? (
        <Text variant="caption" tone="soft" style={{ marginTop: 16, textAlign: "center" }}>
          {job.providerName} will confirm the time shortly.
        </Text>
      ) : job.status === "done" && rated ? (
        <Text variant="caption" tone="soft" style={{ marginTop: 16, textAlign: "center" }}>
          You rated this {job.rating} of 5. Thanks!
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingVertical: 24, borderRadius: radius.xl },
});
