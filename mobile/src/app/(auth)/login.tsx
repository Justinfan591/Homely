import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Logo } from "@/components/AuthForm";
import { ErrorText, LinkText, Muted, Screen, Title } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { API_URL } from "@/lib/config";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo";
import { colors, radius } from "@/lib/theme";

/** Live demo: one tap picks a demo account. No email or password to type. */
export default function ChooseAccount() {
  const { login } = useAuth();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function choose(email: string) {
    setBusy(email);
    setError("");
    try {
      await login(email, DEMO_PASSWORD); // the (auth) layout then redirects to that role's home
    } catch (err) {
      setError((err as Error).message);
      setBusy("");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <Screen style={{ paddingTop: 24 }}>
        <Logo />
        <Title style={{ marginTop: 12 }}>Continue as</Title>
        <View style={{ gap: 8 }}>
          {DEMO_ACCOUNTS.map((a) => (
            <Pressable
              key={a.email}
              onPress={() => choose(a.email)}
              disabled={!!busy}
              style={({ pressed }) => [st.row, (pressed || busy === a.email) && { borderColor: colors.brand500 }, !!busy && busy !== a.email && { opacity: 0.5 }]}
            >
              <Text style={st.name}>{a.label}</Text>
              <Muted>{busy === a.email ? "Opening…" : a.hint}</Muted>
            </Pressable>
          ))}
        </View>
        <ErrorText>{error}</ErrorText>
        <Muted style={{ textAlign: "center" }}>
          <LinkText title="Create a new account" onPress={() => router.push("/signup" as never)} />
        </Muted>
        <Muted style={{ textAlign: "center", fontSize: 12 }}>Server: {API_URL}</Muted>
      </Screen>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  row: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 2 },
  name: { fontSize: 16, fontWeight: "600", color: colors.ink },
});
