import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Button } from "@/components/Button";
import { ChoiceRow, DayPill } from "@/components/Controls";
import { goHome, Screen, Title } from "@/components/Screen";
import { Text } from "@/components/Text";
import { WINDOWS } from "@/domain/format";
import { useSpecOutcome } from "@/hooks/data";
import { api, ApiError } from "@/services";
import { colors } from "@/theme";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Today and the next three days, each with the windows still open. */
function useDays() {
  return useMemo(() => {
    const now = new Date();
    return Array.from({ length: 4 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const windows = WINDOWS.map((w) => {
        const end = new Date(d);
        end.setHours(w.end, 0, 0, 0);
        const start = new Date(d);
        start.setHours(w.start, 0, 0, 0);
        // A window that has already started counts from a few minutes from now.
        const from = start > now ? start : new Date(Math.ceil((now.getTime() + 5 * 60_000) / 900_000) * 900_000);
        return { ...w, startISO: from.toISOString(), open: end.getTime() - from.getTime() >= 30 * 60_000 };
      });
      return { name: i === 0 ? "Today" : DAY_NAMES[d.getDay()], num: d.getDate(), windows };
    }).filter((d) => d.windows.some((w) => w.open));
  }, []);
}

/**
 * Book · when. The estimate is made in the background while the homeowner picks a time;
 * "Find pros" sends it to every matching pro with that window as the preferred time.
 */
export default function Book() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const outcome = useSpecOutcome(scanId);
  const days = useDays();
  const [day, setDay] = useState(0);
  const firstOpen = (d: number) => Math.max(0, days[d]?.windows.findIndex((w) => w.open) ?? 0);
  const [win, setWin] = useState(() => firstOpen(0));
  const [sending, setSending] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const o = outcome.data;
  const needsAnswers = outcome.error instanceof ApiError && outcome.error.code === "needs_answers";

  // Cases the time picker doesn't cover go to the screens that handle them.
  useEffect(() => {
    if (needsAnswers) router.replace(`/questions/${scanId}`);
    else if (o?.kind === "handoff" || o?.kind === "no_provider") router.replace(`/spec/${scanId}`);
    else if (o?.kind === "submitted") router.replace(`/booking/${o.jobId}`);
  }, [o, needsAnswers, scanId]);

  async function send() {
    if (!o || o.kind !== "match") {
      setWaiting(true);
      return;
    }
    const w = days[day]?.windows[win];
    if (!w?.open) return;
    setSending(true);
    setError(null);
    try {
      const job = await api.requestOffers(scanId, w.startISO);
      router.replace(`/finding/${job.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your request. Try again.");
      setSending(false);
    }
  }

  // "Find pros" tapped before the estimate was ready: go as soon as it is.
  useEffect(() => {
    if (waiting && o?.kind === "match") {
      setWaiting(false);
      void send();
    }
  }, [waiting, o]); // eslint-disable-line react-hooks/exhaustive-deps

  const preparing = !o && !outcome.error;
  const loadError = outcome.error && !needsAnswers ? outcome.error.message : null;

  return (
    <Screen
      onBack={goHome}
      footer={
        <>
          {error || loadError ? (
            <Text variant="caption" tone="danger" style={{ textAlign: "center" }} accessibilityRole="alert">
              {error ?? loadError}
            </Text>
          ) : null}
          {loadError ? (
            <Button label="Try again" variant="secondary" onPress={() => outcome.mutate()} />
          ) : (
            <Button label="Find pros" onPress={send} loading={sending || waiting} disabled={!days[day]?.windows[win]?.open} />
          )}
        </>
      }
    >
      <View style={{ marginTop: 16 }}>
        <Title title="When works for you?" sub="Pros will quote for this window." size="title" />
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 32 }} accessibilityRole="radiogroup">
        {days.map((d, i) => (
          <DayPill
            key={d.name + d.num}
            name={d.name}
            num={d.num}
            selected={i === day}
            onPress={() => {
              setDay(i);
              if (!days[i].windows[win]?.open) setWin(firstOpen(i));
            }}
          />
        ))}
      </View>
      <View style={{ gap: 10, marginTop: 12 }} accessibilityRole="radiogroup">
        {days[day]?.windows.map((w, i) => (
          <ChoiceRow key={w.label} label={w.label} detail={w.range} selected={i === win} disabled={!w.open} onPress={() => setWin(i)} />
        ))}
      </View>
      {preparing ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 24 }}>
          <ActivityIndicator color={colors.inkSoft} />
          <Text variant="caption" tone="soft">
            Reviewing your photos and pricing the job…
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}
