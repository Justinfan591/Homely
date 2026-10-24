import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { ESTIMATE_LABEL, priceRange, slotLabel, timeLabel, usd, type ScanResponse } from "@shared/scope";
import { confirmAction } from "@/lib/confirm";
import { colors, font } from "@/lib/theme";
import { useAction } from "@/lib/useAction";
import { Button, Card, ErrorText, LinkText, Muted } from "../ui";
import { BigStatus, ProviderRow, Stars, Stepper } from "./Parts";
import { SpecSummary } from "./SpecView";

/** Minutes until `iso`, refreshed every 15 seconds. */
function useMinutesUntil(iso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  return iso ? Math.max(0, Math.round((new Date(iso).getTime() - now) / 60000)) : null;
}

/** Provider card + status → ETA → 5-star rating. The scan screen polls every 2s. */
export function Track({ data, refresh }: { data: ScanResponse; refresh: () => Promise<unknown> }) {
  const { job, spec, template, scan, matches } = data;
  const actions = useAction(refresh);
  const [stars, setStars] = useState(0);
  const minutes = useMinutesUntil(job?.status === "en_route" ? job.eta : null);
  if (!job) return null;

  const name = job.provider?.name ?? "A specialist";
  const virtual = job.mode === "virtual";
  const provider = job.provider ? <ProviderRow provider={job.provider} distanceKm={virtual ? null : job.distanceKm} /> : null;
  const cancellable = ["pending", "handoff", "virtual_call", "more_info", "declined"].includes(job.status);
  const next = matches[0];
  let body: React.ReactNode;

  switch (job.status) {
    case "pending":
      body = (
        <>
          <BigStatus title={`Waiting for ${name}`} subtitle="They have your scan and estimate. Most pros confirm within a few minutes." />
          <Card>
            {provider}
            <View style={st.waiting}>
              <ActivityIndicator color={colors.brand600} />
              <Muted>Waiting for confirmation…</Muted>
            </View>
          </Card>
        </>
      );
      break;
    case "handoff":
      body = <BigStatus title="A specialist is reviewing your scan" subtitle={`We weren't sure enough to price it automatically, so ${job.provider ? `${name} is` : "a person is"} checking it. You'll see the next step here.`} />;
      break;
    case "virtual_call":
      body = (
        <>
          <BigStatus title="Virtual call requested" subtitle={`${name} will confirm a time for a short video call about your scan.`} />
          {provider && <Card>{provider}</Card>}
        </>
      );
      break;
    case "more_info": {
      const shots = template.required_shots.filter((s) => job.request?.shotIds.includes(s.id));
      const qs = template.questions.filter((q) => job.request?.questionIds.includes(q.id));
      body = (
        <>
          <BigStatus tone="warn" title={`${name} needs a bit more`} subtitle={job.request?.message ?? undefined} />
          {(shots.length > 0 || qs.length > 0) && (
            <Card style={{ gap: 8 }}>
              {shots.map((s) => (
                <Text key={s.id} style={st.item}>
                  📷 {s.prompt}
                </Text>
              ))}
              {qs.map((q) => (
                <Text key={q.id} style={st.item}>
                  👆 {q.q}
                </Text>
              ))}
            </Card>
          )}
          <Button title="Add what they asked for" large loading={actions.busy === "reopen"} onPress={() => actions.run("reopen", `/api/scans/${scan.id}/reopen`)} />
        </>
      );
      break;
    }
    case "accepted":
      body = (
        <>
          <Stepper step={0} labels={["Booked", virtual ? "Call starting" : "On the way", "Done"]} />
          <BigStatus tone="green" title={virtual ? "Video call booked" : "You're booked"} subtitle={job.slot ? slotLabel(job.slot) : undefined} />
          <Card style={{ gap: 14 }}>
            {provider}
            {job.price != null && (
              <View style={{ gap: 2 }}>
                <Text style={st.price}>{usd(job.price)}</Text>
                <Muted>Price confirmed by {name}</Muted>
              </View>
            )}
          </Card>
          <Muted style={{ textAlign: "center" }}>{virtual ? "We'll show the call here when it's time." : "You'll see their ETA here when they're on the way."}</Muted>
        </>
      );
      break;
    case "en_route":
      body = (
        <>
          <Stepper step={1} labels={["Booked", virtual ? "Call starting" : "On the way", "Done"]} />
          <View style={st.eta}>
            <Text style={st.etaLabel}>{virtual ? "Your call is starting" : `${name} is on the way`}</Text>
            {!virtual && <Text style={st.etaBig}>{minutes != null && minutes > 0 ? `${minutes} min` : "Arriving now"}</Text>}
            {!virtual && job.eta ? <Text style={st.etaSub}>Estimated arrival {timeLabel(job.eta)}</Text> : null}
          </View>
          <Card>{provider}</Card>
        </>
      );
      break;
    case "done":
      body =
        job.rating == null ? (
          <>
            <Stepper step={2} labels={["Booked", virtual ? "Call" : "On the way", "Done"]} />
            <BigStatus tone="green" title="All done" subtitle={`How did ${name} do?`} />
            <Stars value={stars} onPick={setStars} />
            <Button title="Send rating" large disabled={!stars} loading={actions.busy === "rate"} onPress={() => actions.run("rate", `/api/scans/${scan.id}/rate`, { stars })} />
          </>
        ) : (
          <>
            <BigStatus tone="green" title="Thanks for rating!" subtitle={`You gave ${name} ${job.rating} star${job.rating > 1 ? "s" : ""}.`} />
            <Stars value={job.rating} size={32} />
            <Button title="Back to home" large onPress={() => router.replace("/customer" as never)} />
          </>
        );
      break;
    case "declined":
      body = (
        <>
          <BigStatus tone="warn" title={`${name} can't take this one`} subtitle={next ? `${next.name} can. Same scan, priced with their rates.` : "No other pro covers your area, but a specialist can help on a video call."} />
          {next ? (
            <>
              <Card style={{ gap: 12 }}>
                <ProviderRow provider={next} distanceKm={next.distanceKm} />
                <Muted>
                  {priceRange(next.quote.low, next.quote.high)} · {ESTIMATE_LABEL}
                </Muted>
              </Card>
              <Button title={`Book ${next.name} · ${slotLabel(next.slots[0].startsAt)}`} large loading={actions.busy === "book"} onPress={() => actions.run("book", `/api/scans/${scan.id}/book`, { providerId: next.id })} />
            </>
          ) : (
            <Button title={template.virtual_call_label} large loading={actions.busy === "virtual"} onPress={() => actions.run("virtual", `/api/scans/${scan.id}/virtual-call`)} />
          )}
        </>
      );
      break;
    case "cancelled":
      body = <BigStatus title="Request cancelled" subtitle="Nothing else to do here." />;
      break;
  }

  return (
    <View style={{ gap: 18 }}>
      {body}
      <ErrorText>{actions.error}</ErrorText>
      {spec && job.status !== "done" && (
        <>
          <View style={st.divider} />
          <SpecSummary spec={spec} template={template} photos={data.photos} />
          {job.price == null && spec.priceLow != null && spec.priceHigh != null && !virtual && (
            <Muted>
              {priceRange(spec.priceLow, spec.priceHigh)} · {ESTIMATE_LABEL}
            </Muted>
          )}
        </>
      )}
      {cancellable && (
        <LinkText
          title="Cancel request"
          style={{ color: colors.red700, textAlign: "center", paddingVertical: 8 }}
          onPress={async () => {
            if (await confirmAction("Cancel this request?", "Cancel request")) await actions.run("cancel", `/api/scans/${scan.id}/cancel`);
          }}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  waiting: { flexDirection: "row", alignItems: "center", gap: 10 },
  item: { fontFamily: font.regular, fontSize: 16, color: colors.ink, lineHeight: 22 },
  price: { fontFamily: font.bold, fontSize: 28, color: colors.ink },
  eta: { alignItems: "center", gap: 4, paddingVertical: 12 },
  etaLabel: { fontFamily: font.medium, fontSize: 17, color: colors.ink60 },
  etaBig: { fontFamily: font.bold, fontSize: 64, color: colors.brand600, letterSpacing: -1 },
  etaSub: { fontFamily: font.regular, fontSize: 15, color: colors.ink50 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
});
