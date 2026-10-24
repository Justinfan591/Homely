import { Tabs, type BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "@/components/haptics";
import { Icon } from "@/components/Icon";
import { colors } from "@/theme";

const ICONS: Record<string, { icon: string; label: string }> = {
  index: { icon: "home", label: "Home" },
  bookings: { icon: "calendar", label: "Jobs" },
  profile: { icon: "user", label: "Account" },
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(props) => <BottomNav {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="bookings" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

/** The design's bare icon bar: Home, Jobs, Account. Black when current, warm grey otherwise. */
function BottomNav({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]} accessibilityRole="tablist">
      {state.routes.map((route, i) => {
        const item = ICONS[route.name];
        if (!item) return null;
        const focused = state.index === i;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: focused }}
            hitSlop={8}
            onPress={() => {
              if (focused) return;
              haptic.select();
              navigateToTab(route.key);
            }}
            style={styles.item}
          >
            <Icon name={item.icon} size={30} color={focused ? colors.ink : colors.inkFaint} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 72,
    paddingTop: 16,
    backgroundColor: colors.bg,
  },
  item: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
});
