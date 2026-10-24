import { Stack } from "expo-router";
import { HomeHeaderRight, RoleStack } from "@/components/RoleStack";

export default function AgentLayout() {
  return (
    <RoleStack role="agent">
      <Stack.Screen name="index" options={{ title: "Support queue", headerRight: () => <HomeHeaderRight /> }} />
      <Stack.Screen name="jobs/[id]" options={{ title: "Job" }} />
    </RoleStack>
  );
}
