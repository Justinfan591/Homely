import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type { ReactNode } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";

/**
 * iOS 26 Liquid Glass where the runtime supports it (works in Expo Go on iOS 26+);
 * a translucent dark fill everywhere else. Use sparingly: only for controls floating over the camera.
 */
export function Glass({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  if (Platform.OS === "ios" && isLiquidGlassAvailable()) {
    return (
      <GlassView glassEffectStyle="regular" colorScheme="dark" style={style}>
        {children}
      </GlassView>
    );
  }
  return <View style={[{ backgroundColor: "rgba(20,20,20,0.5)" }, style]}>{children}</View>;
}
