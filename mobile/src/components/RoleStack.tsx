import { Redirect, Stack, router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import type { Role } from "@shared/api-types";
import { useAuth } from "@/lib/auth";
import { confirmAction } from "@/lib/confirm";
import { homeFor } from "@/lib/nav";
import { colors } from "@/lib/theme";

function HeaderLink({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ paddingHorizontal: 6 }}>
      <Text style={{ color: colors.brand700, fontWeight: "600", fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

/** Header buttons for a role's home screen: extra links plus "Sign out". */
export function HomeHeaderRight({ links = [] }: { links?: { title: string; href: string }[] }) {
  const { logout } = useAuth();
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      {links.map((l) => (
        <HeaderLink key={l.href} title={l.title} onPress={() => router.push(l.href as never)} />
      ))}
      <HeaderLink
        title="Sign out"
        onPress={async () => {
          if (await confirmAction("Sign out of Molsters?", "Sign out", false)) await logout();
        }}
      />
    </View>
  );
}

/** Stack navigator for one role. Sends anyone else back to sign-in or their own home. */
export function RoleStack({ role, children }: { role: Role; children?: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Redirect href={"/login" as never} />;
  if (user.role !== role) return <Redirect href={homeFor(user.role) as never} />;
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.brand700,
        headerTitleStyle: { color: colors.ink, fontWeight: "700" },
        headerStyle: { backgroundColor: colors.white },
        headerShadowVisible: true,
        headerBackTitle: "Back",
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {children}
    </Stack>
  );
}
