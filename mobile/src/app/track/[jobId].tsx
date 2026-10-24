import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Button } from "@/components/Button";
import { Stars } from "@/components/Controls";
import { haptic } from "@/components/haptics";
import { Icon } from "@/components/Icon";
import { goHome, Screen } from "@/components/Screen";
import { ErrorState } from "@/components/States";
import { Text } from "@/components/Text";
import { moneyRange, shortDate } from "@/domain/format";
import type { Job } from "@/domain/types";
import { useJob } from "@/hooks/data";
import { api } from "@/services";
import { colors, radius } from "@/theme";

export default function Track() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { data: job, error, mutate } = useJob(jobId);

  if (error && !job) {
    return (
      <Screen close onBack={() => goHome()}>
        <ErrorState message={error.message} onRetry={() => mutate()} />
      </Screen>
    );
  }
  if (!job) return <Screen close onBack={() => goHome()}><View /></Screen>;
  const refresh = () => void mutate();
  if (job.status === "handoff") return <InReview job={job} onChange={refresh} />;
  if (job.status === "more_info") return <MoreInfo job={job} onChange={refresh} />;
  if (job.status === "declined") return <Declined job={job} onChange={refresh} />;
  if (job.status === "cancelled") return <Cancelled job={job} />;
  return <Progress job={job} onRated={refresh} />;
}

/** "Cancel request", with a second tap to confirm (no native dialogs, so it works on web too). */
function CancelLink({ job, onDone }: { job: Job; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await api.cancelJob(job.id);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      {error ? (
        <Text variant="caption" tone="danger" style={{ textAlign: "center" }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button
        label={confirming ? "Yes, cancel this request" : "Cancel request"}
        variant={confirming ? "danger" : "ghost"}
        compact
        loading={busy}
        onPress={() => (confirming ? cancel() : setConfirming(true))}
      />
    </>
  );
}

function MoreInfo({ job, onChange }: { job: Job; onChange: () => void }) {
  return (
    <Screen
      close
      onBack={() => goHome()}
      footer={
        <>
          <Button label="Add what they asked for" icon="camera" onPress={() => router.push(`/scan/${job.scanId}`)} />
          <CancelLink job={job} onDone={onChange} />
        </>
      }
    >
      <View style={styles.reviewBadge}>
        <Icon name="camera" size={26} color={colors.accent} />
      </View>
      <Text variant="title" style={{ marginTop: 20 }}>
        {job.providerName} needs a bit more
      </Text>
      <Text tone="soft" style={{ marginTop: 8 }}>
        {job.followUp?.message || "They'd like a few more photos or answers before confirming."} It only takes a minute, and your
        updated scope goes straight back to them.
      </Text>
    </Screen>
  );
}

function Declined({ job, onChange }: { job: Job; onChange: () => void }) {
  return (
    <Screen
      close
      onBack={() => goHome()}
      footer={
        <>
          <Button label="See other pros" onPress={() => router.replace(`/spec/${job.scanId}`)} />
          <CancelLink job={job} onDone={onChange} />
        </>
      }
    >
      <View style={[styles.reviewBadge, { backgroundColor: colors.fill }]}>
        <Icon name="calendar" size={26} />
      </View>
      <Text variant="title" style={{ marginTop: 20 }}>
        {job.providerName} can't take this one
      </Text>
      <Text tone="soft" style={{ marginTop: 8 }}>
        Your scope is saved. Pick another pro nearby, or book a virtual call if nobody else is in range.
      </Text>
    </Screen>
  );
}

function Cancelled({ job }: { job: Job }) {
  return (
    <Screen close onBack={() => goHome()} footer={<Button label="Back to home" onPress={() => goHome()} />}>
      <Text variant="title">Request cancelled</Text>
      <Text tone="soft" style={{ marginTop: 8 }}>
        {job.providerName} won't come out for this. Your photos stay in your home record.
      </Text>
    </Screen>
  );
}

function Progress({ job, onRated }: { job: Job; onRated: () => void }) {
  const done = job.status === "done";
  const [stars, setStars] = useState(0);
  const [saving, setSaving] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const rated = job.rating != null;

  useEffect(() => {
    if (done && !rated) haptic.success();
  }, [done, rated]);

  async function rate() {
    setSaving(true);
    setRateError(null);
    try {
      await api.rateJob(job.id, stars);
      onRated();
    } catch (e) {
      setRateError(e instanceof Error ? e.message : "Couldn't save your rating.");
    } finally {
      setSaving(false);
    }
  }

  const steps = job.virtual ? ["Requested", "Booked", "Completed"] : ["Confirmed", "On the way", "Completed"];
  // Index of the last completed step. A pending in-person job isn't confirmed yet, so nothing is filled.
  const filled =
    job.status === "done" ? 2 : job.status === "en_route" ? 1 : job.status === "accepted" ? (job.virtual ? 1 : 0) : job.virtual ? 0 : -1;

  const headline = done
    ? rated
      ? "Thanks for rating"
      : job.virtual
        ? "How was your call?"
        : "How did it go?"
    : job.status === "en_route"
      ? `Arriving in ${job.etaMinutes} min`
      : job.status === "accepted"
        ? job.virtual
          ? "Your call is booked"
          : `${job.providerName} is booked`
        : `Waiting for ${job.providerName}`;

  const sub = done
    ? rated
      ? "Your feedback helps others find great pros."
      : `Rate ${job.providerName}.`
    : job.status === "en_route"
      ? `${job.providerName} is on the way to you now.`
      : job.status === "accepted"
        ? `${job.slot?.label ?? ""}. We'll let you know when they're on the way.`
        : job.slot
          ? `You asked for ${job.slot.label}. They'll confirm the time shortly.`
          : "They've received your scope and will confirm shortly.";

  return (
    <Screen
      close
      onBack={() => goHome()}
      footer={
        done && !rated ? (
          <>
            {rateError ? (
              <Text variant="caption" tone="danger" style={{ textAlign: "center" }} accessibilityRole="alert">
                {rateError}
              </Text>
            ) : null}
            <Button label="Submit rating" onPress={rate} disabled={!stars} loading={saving} />
          </>
        ) : (
          <>
            <Button label="Back to home" variant={done ? "primary" : "secondary"} onPress={() => goHome()} />
            {job.status === "pending" ? <CancelLink job={job} onDone={onRated} /> : null}
          </>
        )
      }
    >
      <Stepper steps={steps} filled={filled} />

      <Animated.View key={headline} entering={FadeInDown.duration(320)} style={{ marginTop: 36 }}>
        <Text variant="display" accessibilityLiveRegion="polite">
          {headline}
        </Text>
        <Text tone="soft" style={{ marginTop: 10 }}>
          {sub}
        </Text>
      </Animated.View>

      {done ? (
        <Animated.View entering={FadeIn.delay(150)} style={{ marginTop: 40 }}>
          <Stars value={rated ? job.rating! : stars} onChange={rated ? undefined : setStars} />
        </Animated.View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.providerRow}>
          <View style={styles.avatar}>
            {job.virtual ? <Icon name="video" size={20} color={colors.accent} /> : <Text variant="heading">{job.providerName[0]}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{job.providerName}</Text>
            <Text variant="caption" tone="soft">
              {job.virtual ? "Virtual call" : job.providerRating ? `★ ${job.providerRating.toFixed(1)}` : "Pro"}
            </Text>
          </View>
        </View>
        <View style={styles.rule} />
        {job.slot ? (
          <Row
            label={job.slotConfirmed === false ? "Requested time" : job.virtual ? "Call" : "Arrival window"}
            value={job.slot.label || shortDate(job.slot.start)}
          />
        ) : null}
        {job.price ? (
          <Row label={job.price.low === job.price.high ? "Confirmed price" : "Estimate"} value={moneyRange(job.price)} />
        ) : job.virtual ? (
          <Row label="Pricing" value="Confirmed on the call" />
        ) : null}
        {job.price ? (
          <Text variant="caption" tone="soft">
            Estimate — confirmed by provider.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

function InReview({ job, onChange }: { job: Job; onChange: () => void }) {
  return (
    <Screen
      close
      onBack={() => goHome()}
      footer={
        <>
          <Button label="Back to home" onPress={() => goHome()} />
          <CancelLink job={job} onDone={onChange} />
        </>
      }
    >
      <View style={styles.reviewBadge}>
        <Icon name="user" size={26} color={colors.accent} />
      </View>
      <Text variant="title" style={{ marginTop: 20 }}>
        A specialist is reviewing this
      </Text>
      <Text tone="soft" style={{ marginTop: 8 }}>
        {job.providerName} has your photos and answers. We'll let you know as soon as someone picks it up.
      </Text>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text tone="soft">{label}</Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
  );
}

function Stepper({ steps, filled }: { steps: string[]; filled: number }) {
  return (
    <View style={styles.stepper}>
      {steps.map((s, i) => (
        <Step key={s} label={s} on={i <= filled} />
      ))}
    </View>
  );
}

function Step({ label, on }: { label: string; on: boolean }) {
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    v.value = withTiming(on ? 1 : 0, { duration: 500 });
  }, [on, v]);
  const bar = useAnimatedStyle(() => ({ width: `${v.value * 100}%` }));
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, bar]} />
      </View>
      <Text variant="caption" tone={on ? "ink" : "faint"}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: "row", gap: 6, marginTop: 8 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: "hidden" },
  fill: { height: 4, backgroundColor: colors.ink },
  card: { marginTop: 40, padding: 20, borderRadius: radius.md, backgroundColor: colors.fill, gap: 14 },
  providerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  reviewBadge: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
});
