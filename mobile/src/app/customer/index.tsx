import * as Location from "expo-location";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import useSWR from "swr";
import { JOB_STATUS_LABELS, SCAN_STATUS_LABELS, priceRange, usd, type HomeRecordItem, type HomeResponse } from "@shared/scope";
import { timeAgo } from "@shared/format";
import { Button, Card, ErrorText, LinkText, Muted, Screen, Spinner, Title } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font, radius } from "@/lib/theme";

/** One tap: use the phone's location (and its street address) as the home. */
function useSetHomeLocation(onSaved: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    setBusy(true);
    setError("");
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error("Allow location access so we can find pros near you.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      const place = (await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }).catch(() => []))[0];
      const address =
        [place?.streetNumber && place?.street ? `${place.streetNumber} ${place.street}` : place?.street ?? place?.name, place?.city].filter(Boolean).join(", ") ||
        `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      await api("/api/home", { method: "PUT", body: { address, lat, lng } });
      await onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function statusText(r: HomeRecordItem) {
  if (r.scanStatus === "cancelled" || r.jobStatus === "cancelled") return "Cancelled";
  if (r.jobStatus === "done" && r.needsAction) return "Done · rate it";
  return r.jobStatus ? JOB_STATUS_LABELS[r.jobStatus] : SCAN_STATUS_LABELS[r.scanStatus];
}

function RecordCard({ r }: { r: HomeRecordItem }) {
  const price = r.price != null ? usd(r.price) : r.priceLow != null && r.priceHigh != null ? priceRange(r.priceLow, r.priceHigh) : null;
  const done = r.jobStatus === "done" || r.scanStatus === "cancelled" || r.jobStatus === "cancelled";
  return (
    <Pressable onPress={() => router.push(`/customer/scan/${r.scanId}` as never)} style={({ pressed }) => [st.card, r.needsAction && st.cardAction, pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={st.cardTitle} numberOfLines={1}>
          {r.title}
        </Text>
        <Text style={st.cardMeta}>
          {r.tradeLabel}
          {r.providerName ? ` · ${r.providerName}` : ""} · {timeAgo(r.updatedAt)}
        </Text>
        <View style={st.cardBottom}>
          <Text style={[st.pill, r.needsAction ? st.pillAction : done ? st.pillDone : null]}>{statusText(r)}</Text>
          {price ? <Text style={st.price}>{price}</Text> : null}
        </View>
      </View>
      <Text style={st.chev}>›</Text>
    </Pressable>
  );
}

/** Home: one big "Scan a problem" button, then the Home Record. */
export default function Home() {
  const { data, error, mutate, isValidating } = useSWR<HomeResponse>("/api/home", { refreshInterval: 4000 });
  const location = useSetHomeLocation(mutate);

  if (error && !data) {
    return (
      <Screen onRefresh={mutate}>
        <ErrorText>{error.message}</ErrorText>
      </Screen>
    );
  }
  if (!data) return <Spinner />;

  if (!data.home) {
    return (
      <Screen>
        <View style={st.hero}>
          <Title style={st.heroTitle}>Point at the problem.{"\n"}Get it fixed.</Title>
          <Muted style={{ fontSize: 17 }}>First, where's your home? We use it to find pros near you.</Muted>
        </View>
        <Button title="Use my current location" large loading={location.busy} onPress={location.run} />
        <ErrorText>{location.error}</ErrorText>
      </Screen>
    );
  }

  const asks = data.record.filter((r) => r.jobStatus === "more_info");
  return (
    <Screen onRefresh={mutate} refreshing={isValidating}>
      <View style={st.hero}>
        <Text style={st.homeLabel}>
          {data.home.label} · {data.home.address}
        </Text>
        <Title style={st.heroTitle}>Point at the problem.{"\n"}Get it fixed.</Title>
      </View>

      <Button title="Scan a problem" large style={st.scan} textStyle={{ fontSize: 20 }} onPress={() => router.push("/customer/scan/new" as never)} />

      {asks.map((r) => (
        <Pressable key={r.scanId} onPress={() => router.push(`/customer/scan/${r.scanId}` as never)} style={st.ask}>
          <Text style={st.askTitle}>{r.providerName ?? "Your pro"} needs a bit more</Text>
          <Text style={st.askBody}>For “{r.title}”. Tap to add it.</Text>
        </Pressable>
      ))}

      <View style={{ gap: 12 }}>
        <Text style={st.section}>Home Record</Text>
        {data.record.length === 0 ? (
          <Card>
            <Muted>Your scans and repairs show up here, so you always know what was done and when.</Muted>
          </Card>
        ) : (
          data.record.map((r) => <RecordCard key={r.scanId} r={r} />)
        )}
      </View>

      <LinkText title={location.busy ? "Updating location…" : "Update home location"} onPress={location.run} style={{ textAlign: "center", fontSize: 14, color: colors.ink50 }} />
      <ErrorText>{location.error}</ErrorText>
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: { gap: 10, paddingTop: 8 },
  homeLabel: { fontFamily: font.medium, fontSize: 14, color: colors.ink50 },
  heroTitle: { fontSize: 32, lineHeight: 38 },
  scan: { paddingVertical: 24 },
  ask: { backgroundColor: colors.amber50, borderColor: colors.amber200, borderWidth: 1, borderRadius: radius.lg, padding: 16, gap: 4 },
  askTitle: { fontFamily: font.semibold, fontSize: 16, color: colors.amber900 },
  askBody: { fontFamily: font.regular, fontSize: 15, color: colors.amber900 },
  section: { fontFamily: font.bold, fontSize: 20, color: colors.ink, marginTop: 8 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16 },
  cardAction: { borderColor: colors.brand600, borderWidth: 1.5 },
  cardTitle: { fontFamily: font.semibold, fontSize: 17, color: colors.ink },
  cardMeta: { fontFamily: font.regular, fontSize: 14, color: colors.ink50 },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  pill: { fontFamily: font.semibold, fontSize: 13, color: colors.brand700, backgroundColor: colors.brand50, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3, overflow: "hidden" },
  pillAction: { color: colors.white, backgroundColor: colors.brand600 },
  pillDone: { color: colors.ink60, backgroundColor: colors.tint },
  price: { fontFamily: font.semibold, fontSize: 15, color: colors.ink },
  chev: { fontSize: 26, color: colors.ink40 },
});
