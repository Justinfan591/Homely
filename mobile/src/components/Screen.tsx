import { router } from "expo-router";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, gutter, radius, shadow } from "@/theme";
import { haptic } from "./haptics";
import { Icon } from "./Icon";
import { Text } from "./Text";

/** Pull to refresh for every scrolling Screen below it (a screen made of several sub-views sets it once). */
const RefreshContext = createContext<(() => Promise<unknown>) | undefined>(undefined);
export const RefreshProvider = ({ onRefresh, children }: { onRefresh: () => Promise<unknown>; children: ReactNode }) => (
  <RefreshContext.Provider value={onRefresh}>{children}</RefreshContext.Provider>
);

/** State for a RefreshControl on a plain ScrollView: `<RefreshControl {...pull} />`. */
export function usePullToRefresh(reload: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload().catch(() => {});
    setRefreshing(false);
  }, [reload]);
  return { refreshing, onRefresh, tintColor: colors.ink, colors: [colors.ink] };
}

/** The design's round white back button (48 px, soft shadow). `dark` is for use over the camera. */
export function CircleButton({
  icon,
  onPress,
  label,
  dark,
}: {
  icon: string;
  onPress: () => void;
  label: string;
  dark?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.circle, dark ? styles.circleDark : shadow, pressed && { opacity: 0.6 }]}
    >
      <Icon name={icon} size={22} color={dark ? colors.white : colors.ink} />
    </Pressable>
  );
}

/**
 * Leave a flow and land on the tab it started from. Flows are pushed over the tabs and advance with
 * `replace`, so dismissing the stack always returns to the existing tabs instead of stacking new ones.
 */
export function goHome() {
  if (router.canDismiss()) router.dismissAll();
}

/** Leave a flow and show the Home tab (e.g. "Done" after booking). */
export function goHomeTab() {
  goHome();
  router.navigate("/");
}

export function goBackOrHome() {
  if (router.canGoBack()) router.back();
  else goHome();
}

/** Big screen title with an optional muted line under it ("Enter the code" / "We sent a code to …"). */
export function Title({ title, sub, size = "display" }: { title: string; sub?: string | null; size?: "display" | "title" }) {
  return (
    <View>
      <Text variant={size} accessibilityRole="header">
        {title}
      </Text>
      {sub ? (
        <Text tone="soft" style={{ marginTop: size === "display" ? 12 : 8 }}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Standard screen: ground background, round back button with an optional centred title,
 * scrolling content and a pinned footer for the main action.
 */
const noop = async () => {};

export function Screen({
  children,
  footer,
  close,
  onBack,
  title,
  trailing,
  scroll = true,
  hideBack,
  onRefresh,
}: {
  children: ReactNode;
  footer?: ReactNode;
  /** Show an X instead of a back arrow. */
  close?: boolean;
  onBack?: () => void;
  /** Small centred title in the top bar ("Listening", "Booking"). */
  title?: string;
  trailing?: ReactNode;
  scroll?: boolean;
  hideBack?: boolean;
  /** Pull to refresh (scrolling screens only): reload the screen's data. */
  onRefresh?: () => Promise<unknown>;
}) {
  const insets = useSafeAreaInsets();
  const inherited = useContext(RefreshContext);
  const reload = onRefresh ?? inherited;
  const pull = usePullToRefresh(reload ?? noop);
  const body = scroll ? (
    <ScrollView
      refreshControl={reload ? <RefreshControl {...pull} /> : undefined}
      contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 32, flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Animated.View entering={FadeInDown.duration(320).springify().damping(24)} style={{ flexGrow: 1 }}>
        {children}
      </Animated.View>
    </ScrollView>
  ) : (
    <View style={{ flex: 1, paddingHorizontal: gutter }}>{children}</View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.bar}>
        {hideBack ? (
          <View style={styles.side} />
        ) : (
          <CircleButton icon={close ? "x" : "chevron-left"} label={close ? "Close" : "Back"} onPress={onBack ?? goBackOrHome} />
        )}
        <Text variant="bodyStrong" numberOfLines={1} style={styles.title}>
          {title ?? ""}
        </Text>
        <View style={[styles.side, { alignItems: "flex-end" }]}>{trailing}</View>
      </View>
      {body}
      {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: {
    height: 48,
    paddingHorizontal: gutter,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  side: { minWidth: 48 },
  title: { flex: 1, textAlign: "center", marginHorizontal: 8 },
  circle: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  circleDark: { backgroundColor: "rgba(0,0,0,0.35)" },
  footer: { paddingHorizontal: gutter, paddingTop: 12, gap: 8 },
});
