import { Stack } from "expo-router";
import { HomeHeaderRight, RoleStack } from "@/components/RoleStack";

export default function CustomerLayout() {
  return (
    <RoleStack role="customer">
      <Stack.Screen name="index" options={{ title: "My requests", headerRight: () => <HomeHeaderRight /> }} />
      <Stack.Screen name="new" options={{ title: "New request" }} />
      <Stack.Screen name="jobs/[id]" options={{ title: "Request" }} />
    </RoleStack>
  );
}
