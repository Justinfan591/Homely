import { Stack } from "expo-router";
import { HomeHeaderRight, RoleStack } from "@/components/RoleStack";

export default function ProviderLayout() {
  return (
    <RoleStack role="provider">
      <Stack.Screen
        name="index"
        options={{ title: "Jobs", headerRight: () => <HomeHeaderRight links={[{ title: "Profile", href: "/provider/profile" }]} /> }}
      />
      <Stack.Screen name="profile" options={{ title: "Your pro profile" }} />
      <Stack.Screen name="jobs/[id]" options={{ title: "Job" }} />
    </RoleStack>
  );
}
