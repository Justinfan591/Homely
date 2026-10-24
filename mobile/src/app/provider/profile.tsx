import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";
import useSWR, { mutate as globalMutate } from "swr";
import type { ProviderProfileResponse } from "@shared/api-types";
import { TRADES, TRADE_LABELS, type Trade } from "@shared/types";
import { Button, Card, Chip, ChipRow, ErrorText, Field, Heading, Input, LinkText, Muted, Notice, Screen, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { colors } from "@/lib/theme";

export default function ProviderProfile() {
  const { data, error: loadError } = useSWR<ProviderProfileResponse>("/api/provider/profile");
  const [form, setForm] = useState({ businessName: "", trades: [] as Trade[], zips: "", bio: "", phone: "", active: true });
  const [status, setStatus] = useState<{ error?: string; saved?: boolean }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data?.profile) return;
    const p = data.profile;
    setForm({ businessName: p.businessName ?? "", trades: p.trades, zips: p.zips.join(", "), bio: p.bio ?? "", phone: data.phone ?? "", active: p.active });
  }, [data]);

  if (loadError && !data) return <Screen><ErrorText>{loadError.message}</ErrorText></Screen>;
  if (!data) return <Spinner />;

  const toggle = (t: Trade) => setForm((f) => ({ ...f, trades: f.trades.includes(t) ? f.trades.filter((x) => x !== t) : [...f.trades, t] }));

  async function save() {
    setSaving(true);
    setStatus({});
    try {
      await api("/api/provider/profile", {
        method: "PUT",
        body: { ...form, zips: form.zips.split(/[\s,]+/).filter(Boolean) },
      });
      setStatus({ saved: true });
      void globalMutate("/api/jobs");
    } catch (err) {
      setStatus({ error: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Muted>We only show you jobs that match your trades and service area.</Muted>

      <Card>
        <Heading>Trades</Heading>
        <ChipRow>
          {TRADES.map((t) => (
            <Chip key={t} label={TRADE_LABELS[t]} selected={form.trades.includes(t)} onPress={() => toggle(t)} />
          ))}
        </ChipRow>
      </Card>

      <Card style={{ gap: 14 }}>
        <Field label="ZIP codes you serve" hint="Separate with commas, e.g. 94110, 94103">
          <Input value={form.zips} onChangeText={(v) => setForm({ ...form, zips: v })} keyboardType="numbers-and-punctuation" />
        </Field>
        <Field label="Business name" hint="Optional. Shown to customers.">
          <Input value={form.businessName} onChangeText={(v) => setForm({ ...form, businessName: v })} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
        </Field>
        <Field label="About you">
          <Input value={form.bio} onChangeText={(v) => setForm({ ...form, bio: v })} multiline />
        </Field>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 15, fontWeight: "500", color: colors.ink }}>Available for new jobs</Text>
          <Switch
            value={form.active}
            onValueChange={(v) => setForm({ ...form, active: v })}
            trackColor={{ true: colors.brand500, false: colors.borderStrong }}
            thumbColor={colors.white}
          />
        </View>
      </Card>

      <ErrorText>{status.error}</ErrorText>
      {status.saved && (
        <Notice>
          <Muted style={{ color: colors.brand900 }}>
            Saved. <LinkText title="See jobs →" onPress={() => router.navigate("/provider" as never)} />
          </Muted>
        </Notice>
      )}
      <Button title="Save profile" onPress={save} loading={saving} large />
    </Screen>
  );
}
