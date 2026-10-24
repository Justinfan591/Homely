import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/Button";
import { Chip, SeverityBar } from "@/components/Controls";
import { Icon } from "@/components/Icon";
import { goHome, Screen } from "@/components/Screen";
import { ErrorState } from "@/components/States";
import { Text } from "@/components/Text";
import { moneyRange, SEVERITY_LABELS } from "@/domain/format";
import type { JobSpec, MatchOption, Scan, Slot, SpecOutcome } from "@/domain/types";
import { useHome } from "@/hooks/home";
import { useScan, useSpecOutcome } from "@/hooks/data";
import { api, ApiError } from "@/services";
import { getTemplate } from "@/templates";
import { colors, radius } from "@/theme";

const STEPS = ["Reviewing your photos", "Measuring the area", "Finding pros nearby", "Calculating your estimate"];

export default function SpecScreen() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const { data: outcome, error, mutate } = useSpecOutcome(scanId);
  const { data: scan } = useScan(scanId);
  const needsAnswers = error instanceof ApiError && error.code === "needs_answers";

  useEffect(() => {
    if (needsAnswers) router.replace(`/clarify/${scanId}`);
  }, [needsAnswers, scanId]);

  if (needsAnswers) return <Analyzing />;
  if (error) {
    return (
      <Screen onBack={() => goHome()} close>
        <ErrorState message={error.message} onRetry={() => mutate()} />
      </Screen>
    );
  }
  if (!outcome) return <Analyzing />;

  switch (outcome.kind) {
    case "match":
      return <Match spec={outcome.spec} options={outcome.options} scan={scan} onHuman={(next) => mutate(next, { revalidate: false })} />;
    case "submitted":
      return <Submitted jobId={outcome.jobId} />;
    case "handoff":
      return <Handoff spec={outcome.spec} />;
    case "no_provider":
      return <NoProvider spec={outcome.spec} scanId={scanId} />;
  }
}

function Analyzing() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 650);
    return () => clearInterval(t);
  }, []);
  return (
    <Screen close onBack={() => goHome()} scroll={false}>
      <View style={styles.centerFill}>
        <Animated.View style={styles.pulse} entering={FadeIn}>
          <Icon name="search" size={26} color={colors.white} />
        </Animated.View>
        <Animated.View key={step} entering={FadeInDown.duration(300)}>
          <Text variant="heading" style={{ textAlign: "center" }} accessibilityLiveRegion="polite">
            {STEPS[step]}…
          </Text>
        </Animated.View>
        <Text tone="soft" style={{ textAlign: "center" }}>
          This usually takes a few seconds.
        </Text>
      </View>
    </Screen>
  );
}

function Header({ spec }: { spec: JobSpec }) {
  const t = getTemplate(spec.trade);
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label" tone="soft">
        {t.title}
      </Text>
      <Text variant="title">{spec.title}</Text>
      <Text tone="soft">{spec.summary}</Text>
    </View>
  );
}

function Facts({ spec }: { spec: JobSpec }) {
  const t = getTemplate(spec.trade);
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 10 }}>
        <View style={styles.between}>
          <Text variant="label" tone="soft">
            Severity
          </Text>
          <Text variant="label">{SEVERITY_LABELS[spec.severity - 1]}</Text>
        </View>
        <SeverityBar level={spec.severity} />
      </View>
      <View style={styles.rule} />
      <Fact label={t.areaLabel} value={`about ${spec.areaM2} m²`} />
      {spec.fields.map((f) => (
        <Fact key={f.label} label={f.label} value={f.value} />
      ))}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text tone="soft" style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Text variant="bodyStrong" style={{ flex: 1, textAlign: "right" }}>
        {value}
      </Text>
    </View>
  );
}

function Photos({ scan }: { scan?: Scan }) {
  const photos = scan?.photos.filter((p) => p.uri) ?? [];
  if (!photos.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -24 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 24 }}>
      {photos.map((p) => (
        <Image key={p.shotId} source={{ uri: p.uri }} style={styles.photo} contentFit="cover" />
      ))}
    </ScrollView>
  );
}

/** Already with a pro (e.g. after answering an "ask for more"): go to tracking. */
function Submitted({ jobId }: { jobId: string }) {
  useEffect(() => {
    router.replace(`/track/${jobId}`);
  }, [jobId]);
  return <Analyzing />;
}

/** Ready to go: send the scope to every pro nearby at once. Their offers arrive on the Track screen. */
function Match({ spec, options, scan, onHuman }: { spec: JobSpec; options: MatchOption[]; scan?: Scan; onHuman: (o: SpecOutcome) => void }) {
  const [slotId, setSlotId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slots = options[0]?.slots ?? [];
  const range = { low: Math.min(...options.map((o) => o.price.low)), high: Math.max(...options.map((o) => o.price.high)) };
  const count = options.length;

  async function human() {
    setSending(true);
    setError(null);
    try {
      onHuman(await api.askForHuman(spec.scanId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach a person. Try again.");
      setSending(false);
    }
  }

  async function request() {
    setSending(true);
    setError(null);
    try {
      const job = await api.requestOffers(spec.scanId, slotId ?? undefined);
      router.replace(`/track/${job.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your request. Try again.");
      setSending(false);
    }
  }

  return (
    <Screen
      close
      onBack={() => goHome()}
      footer={
        <>
          {error ? (
            <Text variant="caption" tone="danger" style={{ textAlign: "center" }} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button label={`Get offers from ${count} ${count === 1 ? "pro" : "pros"}`} onPress={request} loading={sending} />
          <Button label="Talk to a person instead" variant="ghost" compact onPress={human} disabled={sending} />
        </>
      }
    >
      <Header spec={spec} />
      <View style={{ height: 28 }} />
      <Facts spec={spec} />

      <View style={styles.estimate}>
        <Text variant="label" tone="soft">
          Typical price nearby
        </Text>
        <Text variant="display" style={{ marginTop: 4 }}>
          {moneyRange(range)}
        </Text>
        <Text variant="caption" tone="soft" style={{ marginTop: 6 }}>
          {count} {count === 1 ? "pro" : "pros"} nearby will see your scope at the same time and send their own price and time. You pick
          the offer you like.
        </Text>
      </View>

      {slots.length ? (
        <>
          <Text variant="heading" style={{ marginTop: 28, marginBottom: 12 }}>
            Preferred time (optional)
          </Text>
          <View style={styles.chips}>
            {slots.map((s) => (
              <Chip key={s.id} label={s.label} selected={slotId === s.id} onPress={() => setSlotId(slotId === s.id ? null : s.id)} />
            ))}
          </View>
        </>
      ) : null}

      <View style={{ height: 24 }} />
      <Photos scan={scan} />
    </Screen>
  );
}

function Handoff({ spec }: { spec: JobSpec }) {
  return (
    <Screen
      close
      onBack={() => goHome()}
      footer={<Button label="Back to home" onPress={() => goHome()} />}
    >
      <View style={[styles.badgeLg, { backgroundColor: colors.accentSoft }]}>
        <Icon name="user" size={26} color={colors.accent} />
      </View>
      <Text variant="title" style={{ marginTop: 20 }}>
        A specialist will take a look
      </Text>
      <Text tone="soft" style={{ marginTop: 8 }}>
        We weren't confident enough to price this from the photos alone. A person will review your scan, with everything
        you've shared attached, and get back to you.
      </Text>
      <View style={{ height: 32 }} />
      <Header spec={spec} />
      <Text variant="caption" tone="soft" style={{ marginTop: 24 }}>
        You'll find this in your home record, and we'll let you know when someone picks it up.
      </Text>
    </Screen>
  );
}

function NoProvider({ spec, scanId }: { spec: JobSpec; scanId: string }) {
  const { home } = useHome();
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotId, setSlotId] = useState<string>();
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const provider = spec.trade === "mold" ? "Mold Busters" : "a Scope specialist";

  useEffect(() => {
    api
      .listVirtualSlots()
      .then((s) => {
        setSlots(s);
        setSlotId(s[0]?.id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load times."));
  }, []);

  async function book() {
    if (!slotId) return;
    setBooking(true);
    setError(null);
    try {
      const job = await api.bookVirtualCall(scanId, slotId);
      router.replace(`/track/${job.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't book. Try again.");
      setBooking(false);
    }
  }

  return (
    <Screen
      close
      onBack={() => goHome()}
      footer={
        <>
          {error ? (
            <Text variant="caption" tone="danger" style={{ textAlign: "center" }} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button label="Book a virtual call" icon="video" onPress={book} disabled={!slotId} loading={booking} />
        </>
      }
    >
      <View style={[styles.badgeLg, { backgroundColor: colors.fill }]}>
        <Icon name="map-pin" size={26} />
      </View>
      <Text variant="title" style={{ marginTop: 20 }}>
        No pros nearby yet
      </Text>
      <Text tone="soft" style={{ marginTop: 8 }}>
        We couldn't find a qualified pro in range of {home?.name ?? "your home"}. You can walk through the photos with{" "}
        {provider} on a video call instead.
      </Text>
      <View style={{ height: 28 }} />
      <Header spec={spec} />
      <Text variant="heading" style={{ marginTop: 32, marginBottom: 14 }}>
        Pick a time
      </Text>
      <View style={styles.chips}>
        {slots?.map((s) => <Chip key={s.id} label={s.label} selected={slotId === s.id} onPress={() => setSlotId(s.id)} />)}
      </View>
      <Text variant="caption" tone="soft" style={{ marginTop: 20 }}>
        Any pricing is confirmed on the call.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingBottom: 80 },
  pulse: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  fact: { flexDirection: "row", justifyContent: "space-between", gap: 24 },
  estimate: { marginTop: 32, padding: 20, borderRadius: radius.md, backgroundColor: colors.fill },
  provider: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 12, paddingVertical: 8 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  photo: { width: 84, height: 84, borderRadius: 14, backgroundColor: colors.fill },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badgeLg: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
});
