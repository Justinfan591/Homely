import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/Button";
import { Chip, SeverityBar } from "@/components/Controls";
import { Icon } from "@/components/Icon";
import { goHome, Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { ErrorState } from "@/components/States";
import { Text } from "@/components/Text";
import { moneyRange, SEVERITY_LABELS } from "@/domain/format";
import type { JobSpec, MatchOption, Scan, Slot, SpecOutcome } from "@/domain/types";
import { useHome } from "@/hooks/home";
import { useScan, useSpecOutcome } from "@/hooks/data";
import { api, ApiError } from "@/services";
import { getTemplate } from "@/templates";
import { colors, radius } from "@/theme";

const STEPS = ["Reviewing your photos", "Measuring the area", "Matching you with pros", "Calculating your estimate"];

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

function Match({ spec, options, scan, onHuman }: { spec: JobSpec; options: MatchOption[]; scan?: Scan; onHuman: (o: SpecOutcome) => void }) {
  const [choice, setChoice] = useState({ provider: options[0].provider.id, slot: options[0].slots[0].id });
  const [sheet, setSheet] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const option = options.find((o) => o.provider.id === choice.provider) ?? options[0];
  const slot = option.slots.find((s) => s.id === choice.slot) ?? option.slots[0];

  async function human() {
    setBooking(true);
    setError(null);
    try {
      onHuman(await api.askForHuman(spec.scanId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach a person. Try again.");
      setBooking(false);
    }
  }

  async function book() {
    setBooking(true);
    setError(null);
    try {
      const job = await api.bookJob(spec.scanId, option.provider.id, slot.id);
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
          <Button label={`Book ${option.provider.name} · ${slot.label}`} onPress={book} loading={booking} />
          <Button label="See other options" variant="ghost" compact onPress={() => setSheet(true)} />
          <Button label="Talk to a person instead" variant="ghost" compact onPress={human} disabled={booking} />
        </>
      }
    >
      <Header spec={spec} />
      <View style={{ height: 28 }} />
      <Facts spec={spec} />

      <View style={styles.estimate}>
        <Text variant="label" tone="soft">
          Estimated price
        </Text>
        <Text variant="display" style={{ marginTop: 4 }}>
          {moneyRange(option.price)}
        </Text>
        <Text variant="caption" tone="soft" style={{ marginTop: 6 }}>
          Estimate — confirmed by provider. You pick a time; {option.provider.name} confirms it.
        </Text>
      </View>

      <View style={[styles.provider]}>
        <View style={styles.avatar}>
          <Text variant="heading">{option.provider.name[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{option.provider.name}</Text>
          <Text variant="caption" tone="soft">
            ★ {option.provider.rating.toFixed(1)} ({option.provider.reviews}) · {option.distanceKm.toFixed(1)} km away
          </Text>
        </View>
      </View>

      <View style={{ height: 24 }} />
      <Photos scan={scan} />

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Choose a pro and time">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 24, paddingBottom: 8 }}>
          {options.map((o) => (
            <View key={o.provider.id} style={{ gap: 12 }}>
              <View style={styles.between}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{o.provider.name}</Text>
                  <Text variant="caption" tone="soft">
                    ★ {o.provider.rating.toFixed(1)} · {o.distanceKm.toFixed(1)} km · arrives in about {o.provider.etaMinutes} min
                  </Text>
                </View>
                <Text variant="bodyStrong">{moneyRange(o.price)}</Text>
              </View>
              <View style={styles.chips}>
                {o.slots.map((s) => (
                  <Chip
                    key={s.id}
                    label={s.label}
                    selected={choice.provider === o.provider.id && choice.slot === s.id}
                    onPress={() => {
                      setChoice({ provider: o.provider.id, slot: s.id });
                      setSheet(false);
                    }}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </Sheet>
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
