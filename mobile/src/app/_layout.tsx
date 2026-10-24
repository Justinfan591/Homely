import { InterTight_400Regular, InterTight_500Medium, InterTight_600SemiBold, useFonts } from "@expo-google-fonts/inter-tight";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SWRConfig } from "swr";
import { FollowUpNotifier } from "@/components/FollowUpNotifier";
import { HomeProvider } from "@/hooks/home";
import { SessionProvider, useSession } from "@/hooks/session";
import { colors, maxWidth } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded] = useFonts({ InterTight_400Regular, InterTight_500Medium, InterTight_600SemiBold });
  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <SWRConfig value={{ dedupingInterval: 0, errorRetryCount: 2 }}>
          <SessionProvider>
            <HomeProvider>
              <StatusBar style="dark" />
              {/* iPad and web: one centred column at most `maxWidth` wide, so the phone design scales instead of stretching. */}
              <View style={{ flex: 1, width: "100%", maxWidth, alignSelf: "center" }}>
                <Routes />
              </View>
            </HomeProvider>
          </SessionProvider>
        </SWRConfig>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Signed out: only the sign-in screens exist. Signed in: the tabs and every flow on top of them. */
function Routes() {
  const session = useSession();
  useEffect(() => {
    if (session !== "loading") SplashScreen.hideAsync().catch(() => {});
  }, [session]);
  if (session === "loading") return null;
  const signedIn = session === "signed_in";

  return (
    <>
      {signedIn ? <FollowUpNotifier /> : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "slide_from_right",
        }}
      >
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="setup" options={{ gestureEnabled: false }} />
          <Stack.Screen name="scan/[scanId]" options={{ animation: "fade", gestureEnabled: false }} />
          <Stack.Screen name="tell/photo" options={{ animation: "fade" }} />
          <Stack.Screen name="finding/[jobId]" options={{ animation: "fade", gestureEnabled: false }} />
          <Stack.Screen name="booked/[jobId]" options={{ animation: "fade", gestureEnabled: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
