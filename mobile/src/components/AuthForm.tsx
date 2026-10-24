import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { API_URL } from "@/lib/config";
import { colors } from "@/lib/theme";
import { Button, Card, ErrorText, Field, Input, LinkText, Screen, Segmented, Title } from "./ui";

export function Logo() {
  return (
    <View style={st.logo}>
      <View style={st.logoMark}>
        <Text style={st.logoMarkText}>⌂</Text>
      </View>
      <Text style={st.logoText}>Molsters</Text>
    </View>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { login, signup } = useAuth();
  const [role, setRole] = useState<"customer" | "provider">("customer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await signup({ name, email: email.trim(), password, phone: phone || undefined, role });
      }
      // The (auth) layout redirects to the right home screen once signed in.
      // New pros see a "finish your profile" prompt there.
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <Screen style={{ paddingTop: 24 }}>
        <Logo />
        <Title style={{ marginTop: 12 }}>{mode === "login" ? "Welcome back" : "Create your account"}</Title>
        <Card style={{ gap: 14 }}>
          {mode === "signup" && (
            <Segmented
              value={role}
              onChange={setRole}
              options={[
                { value: "customer", label: "I need help" },
                { value: "provider", label: "I'm a pro" },
              ]}
            />
          )}
          {mode === "signup" && (
            <Field label={role === "provider" ? "Your name" : "Name"}>
              <Input value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
            </Field>
          )}
          <Field label="Email">
            <Input value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
          </Field>
          {mode === "signup" && (
            <Field label="Phone" hint="So your pro can reach you. Optional.">
              <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
            </Field>
          )}
          <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
            <Input
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              textContentType={mode === "signup" ? "newPassword" : "password"}
              onSubmitEditing={submit}
              returnKeyType="go"
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button title={mode === "signup" ? "Create account" : "Sign in"} onPress={submit} loading={loading} large />
          <Text style={st.switch}>
            {mode === "signup" ? "Already have an account? " : "New here? "}
            <LinkText
              title={mode === "signup" ? "Sign in" : "Create an account"}
              onPress={() => (mode === "signup" ? router.back() : router.push("/signup" as never))}
            />
          </Text>
        </Card>
        {mode === "login" && __DEV__ && (
          <View style={st.demo}>
            <Text style={[st.demoText, { fontWeight: "600" }]}>Demo accounts (password: password123)</Text>
            <Text style={st.demoText}>customer@demo.com · agent@demo.com</Text>
            <Text style={st.demoText}>plumber@demo.com · electrician@demo.com · hvac@demo.com</Text>
            <Text style={[st.demoText, { marginTop: 6, opacity: 0.7 }]}>Server: {API_URL}</Text>
          </View>
        )}
      </Screen>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  logo: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoMark: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.brand600, alignItems: "center", justifyContent: "center" },
  logoMarkText: { color: colors.white, fontSize: 20, fontWeight: "700", lineHeight: 24 },
  logoText: { fontSize: 18, fontWeight: "700", color: colors.ink },
  switch: { textAlign: "center", fontSize: 14, color: colors.ink60 },
  demo: { backgroundColor: colors.brand50, borderRadius: 12, padding: 12, gap: 2 },
  demoText: { fontSize: 12, color: colors.brand900, lineHeight: 18 },
});
