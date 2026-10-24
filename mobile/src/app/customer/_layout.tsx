import { Stack } from "expo-router";
import { HomeHeaderRight, RoleStack } from "@/components/RoleStack";

export default function CustomerLayout() {
  return (
    <RoleStack role="customer">
      <Stack.Screen name="index" options={{ title: "Scope", headerRight: () => <HomeHeaderRight /> }} />
      <Stack.Screen name="scan/new" options={{ title: "New scan" }} />
      <Stack.Screen name="scan/[id]" options={{ title: "Scan" }} />
    </RoleStack>
  );
}
