import { ScrollView, StyleSheet, Text, View } from "react-native";
import { money } from "@shared/format";
import type { JobReport } from "@shared/types";
import { colors, radius } from "@/lib/theme";
import { PhotoThumb } from "./Photos";
import { TradeBadge, UrgencyBadge } from "./ui";

function List({ title, items, warn }: { title: string; items: string[]; warn?: boolean }) {
  if (!items.length) return null;
  return (
    <View style={{ gap: 6 }}>
      <Text style={[st.sectionTitle, warn && { color: colors.red700 }]}>{title}</Text>
      {items.map((x, i) => (
        <View key={i} style={st.item}>
          <View style={[st.bullet, warn && { backgroundColor: colors.red500 }]} />
          <Text style={st.itemText}>{x}</Text>
        </View>
      ))}
    </View>
  );
}

export function ReportCard({ report, photoUrl }: { report: JobReport; photoUrl?: (id: number) => string | undefined }) {
  const refs = photoUrl ? report.photo_ids_referenced.map((id) => ({ id, url: photoUrl(id) })).filter((p) => p.url) : [];
  const hours = report.est_hours.min === report.est_hours.max ? `${report.est_hours.min}` : `${report.est_hours.min}–${report.est_hours.max}`;
  return (
    <View style={st.card}>
      <View style={st.header}>
        <View style={st.badges}>
          <Text style={st.kicker}>JOB REPORT</Text>
          <TradeBadge trade={report.category} />
          <UrgencyBadge urgency={report.urgency} />
        </View>
        <Text style={st.title}>{report.title}</Text>
        <Text style={st.summary}>{report.summary}</Text>
        <View style={st.stats}>
          <View style={st.stat}>
            <Text style={st.statLabel}>Estimated cost</Text>
            <Text style={st.statValue}>{money(report.est_cost_usd)}</Text>
          </View>
          <View style={st.stat}>
            <Text style={st.statLabel}>Estimated time</Text>
            <Text style={st.statValue}>{hours} h</Text>
          </View>
        </View>
      </View>

      <View style={st.body}>
        <List title="SAFETY" items={report.safety_hazards} warn />
        <List title="WHAT WE SEE" items={report.observed_issues} />
        <List title="LIKELY CAUSES" items={report.likely_causes} />
        <List title="WORK NEEDED" items={report.scope_of_work} />
        <List title="PARTS & MATERIALS" items={report.materials_likely} />
        {report.access_notes ? (
          <View style={{ gap: 6 }}>
            <Text style={st.sectionTitle}>ACCESS</Text>
            <Text style={st.itemText}>{report.access_notes}</Text>
          </View>
        ) : null}
        {report.customer_answers.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={st.sectionTitle}>CUSTOMER ANSWERS</Text>
            {report.customer_answers.map((qa, i) => (
              <View key={i}>
                <Text style={st.question}>{qa.question}</Text>
                <Text style={st.answer}>{qa.answer}</Text>
              </View>
            ))}
          </View>
        )}
        {refs.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {refs.map((p) => (
              <PhotoThumb key={p.id} path={p.url!} size={80} />
            ))}
          </ScrollView>
        )}
        <Text style={st.footnote}>AI-generated from your photos and answers ({report.confidence} confidence). Your pro will confirm on site.</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  header: { backgroundColor: colors.brand50, padding: 16, gap: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  kicker: { fontSize: 12, fontWeight: "600", color: colors.brand700, letterSpacing: 0.5 },
  title: { fontSize: 18, fontWeight: "700", color: colors.ink, lineHeight: 24 },
  summary: { fontSize: 14, color: colors.ink75, lineHeight: 21 },
  stats: { flexDirection: "row", gap: 10, marginTop: 8 },
  stat: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
  statLabel: { fontSize: 12, color: colors.ink50 },
  statValue: { fontSize: 16, fontWeight: "700", color: colors.ink },
  body: { padding: 16, gap: 18 },
  sectionTitle: { fontSize: 12, fontWeight: "600", color: colors.ink40, letterSpacing: 0.5 },
  item: { flexDirection: "row", gap: 8 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand500, marginTop: 7 },
  itemText: { flex: 1, fontSize: 14, color: colors.ink, lineHeight: 20 },
  question: { fontSize: 14, color: colors.ink50 },
  answer: { fontSize: 14, fontWeight: "500", color: colors.ink },
  footnote: { fontSize: 12, color: colors.ink40 },
});
