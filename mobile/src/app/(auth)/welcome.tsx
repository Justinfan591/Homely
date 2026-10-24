import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { ArtPile } from "@/components/Design";
import { Text } from "@/components/Text";
import { colors, gutter } from "@/theme";

/** Sign up · welcome */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <ArtPile count={5} style={{ marginHorizontal: -gutter }} />
      <Text variant="hero" accessibilityRole="header" style={{ fontSize: 48, lineHeight: 48 }}>
        Home fixes,{"\n"}handled.
      </Text>
      <View style={{ gap: 10, marginTop: 32 }}>
        <Button label="Continue with phone" onPress={() => router.push({ pathname: "/contact", params: { mode: "phone" } })} />
        <Button label="Continue with email" variant="secondary" onPress={() => router.push({ pathname: "/contact", params: { mode: "email" } })} />
      </View>
      <Text variant="caption" tone="soft" style={{ textAlign: "center", marginTop: 16 }}>
        By continuing you agree to our Terms and Privacy Policy.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: gutter },
});
