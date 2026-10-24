import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ESTIMATE_LABEL, priceRange, slotLabel, type JobSpecInfo, type ProviderMatch, type ScanResponse, type Template } from "@shared/scope";
import { colors, font, radius } from "@/lib/theme";
import { useAction } from "@/lib/useAction";
import { PhotoThumb } from "../Photos";
import { Button, Card, ErrorText, LinkText, Muted, Title } from "../ui";
import { Fact, Kicker, ProviderRow, SeverityBar } from "./Parts";

/** What the AI found: title, severity, area, fields and the scan photos. */
export function SpecSummary({ spec, template, photos }: { spec: JobSpecInfo; template: Template; photos: ScanResponse["photos"] }) {
  const best = template.required_shots.flatMap((s) => photos.filter((p) => p.shotId === s.id && p.ok).slice(-1));
  return (
    <>
      <View style={{ gap: 8 }}>
        <Kicker>{template.label}</Kicker>
        <Title>{spec.title}</Title>
        <View style={st.policy}>
          <Text style={st.policyText}>{template.policy.finding_wording}</Text>
        </View>
      </View>
      <Card style={{ gap: 16 }}>
        <Fact label="Severity">
          <SeverityBar value={spec.severity} />
        </Fact>
        <Fact label="Affected area">{spec.areaM2 > 0 ? `About ${spec.areaM2} m²` : "Small / not measurable"}</Fact>
        {Object.entries(spec.fields).map(([k, v]) => (
          <Fact key={k} label={template.output_labels[k] ?? k.replace(/_/g, " ")}>
            {v}
          </Fact>
        ))}
      </Card>
      {best.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {best.map((p) => (
            <PhotoThumb key={p.id} path={p.url} size={88} label={template.required_shots.find((s) => s.id === p.shotId)?.prompt} />
          ))}
        </ScrollView>
      ) : null}
    </>
  );
}

function PriceCard({ match }: { match: ProviderMatch }) {
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <Text style={st.price}>{priceRange(match.quote.low, match.quote.high)}</Text>
        <Text style={st.estimate}>{ESTIMATE_LABEL}</Text>
      </View>
      <ProviderRow provider={match} distanceKm={match.distanceKm} />
    </Card>
  );
}

/** Spec screen: issue, severity, area, price range and one "Book [Provider] · [time]" button. */
export function SpecView({ data, refresh }: { data: ScanResponse; refresh: () => Promise<unknown> }) {
  const { spec, template, matches, scan } = data;
  const actions = useAction(refresh);
  const [showOthers, setShowOthers] = useState(false);
  if (!spec) return null;
  const top = matches[0];
  const others = matches.slice(1);
  const bookTitle = (m: ProviderMatch) => `Book ${m.name} · ${slotLabel(m.slots[0].startsAt)}`;

  return (
    <View style={{ gap: 18 }}>
      <SpecSummary spec={spec} template={template} photos={data.photos} />

      {top ? (
        <>
          <PriceCard match={top} />
          <Button title={bookTitle(top)} large loading={actions.busy === `book${top.id}`} disabled={!!actions.busy} onPress={() => actions.run(`book${top.id}`, `/api/scans/${scan.id}/book`, { providerId: top.id })} />
          {others.length > 0 &&
            (showOthers ? (
              <View style={{ gap: 10 }}>
                {others.map((m) => (
                  <Card key={m.id} style={{ gap: 10 }}>
                    <ProviderRow provider={m} distanceKm={m.distanceKm} />
                    <Muted>
                      {priceRange(m.quote.low, m.quote.high)} · {ESTIMATE_LABEL}
                    </Muted>
                    <Button title={bookTitle(m)} variant="secondary" loading={actions.busy === `book${m.id}`} disabled={!!actions.busy} onPress={() => actions.run(`book${m.id}`, `/api/scans/${scan.id}/book`, { providerId: m.id })} />
                  </Card>
                ))}
              </View>
            ) : (
              <LinkText title={`See ${others.length} other pro${others.length > 1 ? "s" : ""}`} onPress={() => setShowOthers(true)} style={st.link} />
            ))}
          <LinkText title="I'd rather talk to a person" onPress={() => actions.run("human", `/api/scans/${scan.id}/human`)} style={st.link} />
        </>
      ) : (
        <>
          <Card>
            <Text style={st.noneTitle}>No pros cover your area yet</Text>
            <Muted>A specialist can look at your scan with you on a short video call.</Muted>
          </Card>
          <Button title={template.virtual_call_label} large loading={actions.busy === "virtual"} onPress={() => actions.run("virtual", `/api/scans/${scan.id}/virtual-call`)} />
        </>
      )}
      <ErrorText>{actions.error}</ErrorText>
    </View>
  );
}

const st = StyleSheet.create({
  policy: { alignSelf: "flex-start", backgroundColor: colors.brand50, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  policyText: { fontFamily: font.medium, fontSize: 15, color: colors.brand900 },
  price: { fontFamily: font.bold, fontSize: 34, color: colors.ink, letterSpacing: -0.5 },
  estimate: { fontFamily: font.medium, fontSize: 14, color: colors.ink50 },
  noneTitle: { fontFamily: font.semibold, fontSize: 18, color: colors.ink },
  link: { textAlign: "center", fontSize: 16, paddingVertical: 4 },
});
