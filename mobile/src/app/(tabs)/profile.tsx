import { router } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Skeleton } from "@/components/Controls";
import { Card, InfoRow } from "@/components/Design";
import { haptic } from "@/components/haptics";
import { ErrorState } from "@/components/States";
import { Text } from "@/components/Text";
import { useProfile } from "@/hooks/data";
import { api } from "@/services";
import { colors, gutter, radius } from "@/theme";
import { usePullToRefresh } from "@/components/Screen";

/** Profile */
export default function Profile() {
  const insets = useSafeAreaInsets();
  const { data: profile, error, mutate } = useProfile();
  const pull = usePullToRefresh(() => mutate());
  const edit = () => router.push("/profile/edit");

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 32, paddingHorizontal: gutter, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl {...pull} />}
    >
      <View style={styles.head}>
        <Text variant="display" accessibilityRole="header">
          Profile
        </Text>
        <Pressable accessibilityRole="button" onPress={edit} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.5 }}>
          <Text variant="bodyStrong" tone="soft">
            Edit
          </Text>
        </Pressable>
      </View>

      {error && !profile ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : !profile ? (
        <View style={{ gap: 12, marginTop: 32 }}>
          <Skeleton height={120} radius={radius.lg} />
          <Skeleton height={180} radius={radius.lg} />
        </View>
      ) : (
        <>
          <View style={styles.who}>
            <View style={styles.avatar}>
              <Text variant="display" tone="white" style={{ fontSize: 36 }}>
                {profile.name.trim()[0]?.toUpperCase() ?? "?"}
              </Text>
            </View>
            <Text variant="title">{profile.name || "Your name"}</Text>
            <Text tone="soft">{profile.email ?? profile.phone ?? ""}</Text>
          </View>
          <Card style={{ paddingVertical: 4 }}>
            <InfoRow label="Age" value={profile.age ? String(profile.age) : "Add"} onPress={edit} />
            <InfoRow label="Address" value={profile.address ?? "Add"} onPress={edit} />
            <InfoRow label="Home" value={profile.homeType ?? "Add"} onPress={edit} last />
          </Card>
          <Button
            label="Sign out"
            variant="ghost"
            onPress={() => {
              haptic.tap();
              void api.signOut();
            }}
            style={{ marginTop: 24 }}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  who: { alignItems: "center", gap: 6, marginTop: 32, marginBottom: 28 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
});
