import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/lib/auth";
import { homeFor } from "@/lib/nav";
import { colors } from "@/lib/theme";

export default function AuthLayout() {
  const { user } = useAuth();
  if (user) return <Redirect href={homeFor(user.role) as never} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
