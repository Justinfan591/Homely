import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, gutter, radius } from "@/theme";
import { haptic } from "./haptics";
import { Icon } from "./Icon";

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
      style={({ pressed }) => [styles.circle, dark && styles.circleDark, pressed && { opacity: 0.6 }]}
    >
      <Icon name={icon} size={20} color={dark ? colors.white : colors.ink} />
    </Pressable>
  );
}

/**
 * Leave a flow. Every flow is entered from Home and advances with `replace`, so the stack is always
 * [Home, current screen]: popping returns to the existing Home instead of stacking a second one.
 */
export function goHome() {
  router.dismissAll();
}

export const goBackOrHome = goHome;

/**
 * Standard screen: safe areas, a back/close control, scrolling content and a pinned footer for the single primary action.
 */
export function Screen({
  children,
  footer,
  close,
  onBack,
  trailing,
  scroll = true,
}: {
  children: ReactNode;
  footer?: ReactNode;
  /** Show an X instead of a back arrow. */
  close?: boolean;
  onBack?: () => void;
  trailing?: ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: 32, flexGrow: 1 }}
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
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <CircleButton
          icon={close ? "x" : "arrow-left"}
          label={close ? "Close" : "Back"}
          onPress={onBack ?? goBackOrHome}
        />
        {trailing}
      </View>
      {body}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>{footer}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: {
    height: 56,
    paddingHorizontal: gutter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  circle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  circleDark: { backgroundColor: "rgba(0,0,0,0.35)" },
  footer: { paddingHorizontal: gutter, paddingTop: 12, gap: 8 },
});
