import { Stack } from "expo-router";
import { colors } from "@/theme";

export const unstable_settings = { initialRouteName: "name" };

/** Finishing sign-up (name, then home). Shown until both are saved. */
export default function SetupLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: "slide_from_right" }} />;
}
