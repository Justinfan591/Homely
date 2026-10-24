import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRef, type ReactNode, type RefObject } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { colors, radius } from "@/theme";
import { Button } from "./Button";
import { haptic } from "./haptics";
import { Icon } from "./Icon";
import { Text } from "./Text";

/** Camera state shared by the photo screens: permission, the camera ref, and a shutter flash. */
export function useCamera() {
  const [permission, requestPermission] = useCameraPermissions();
  const ref = useRef<CameraView>(null);
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  /** Takes a photo and returns its uri (null if the camera isn't ready). */
  async function snap(): Promise<string | null> {
    if (!ref.current) return null;
    haptic.tap();
    flash.value = withSequence(withTiming(0.7, { duration: 60 }), withTiming(0, { duration: 220 }));
    const photo = await ref.current.takePictureAsync({ quality: 0.6, skipProcessing: true });
    return photo?.uri ?? null;
  }

  return { permission, requestPermission, ref, snap, flashStyle, granted: !!permission?.granted };
}

export async function pickFromLibrary(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
  return !res.canceled && res.assets[0] ? res.assets[0].uri : null;
}

/**
 * The design's viewfinder: a rounded dark panel with corner brackets. Shows the live camera,
 * or a still (`previewUri`) with an optional status pill while a photo is being checked.
 */
export function CameraPanel({
  camera,
  previewUri,
  status,
  onLibrary,
  children,
}: {
  camera: ReturnType<typeof useCamera>;
  previewUri?: string | null;
  /** "Checking photo…" (spinner) or "Got it" (check). */
  status?: { text: string; done?: boolean; bad?: boolean } | null;
  onLibrary?: () => void;
  children?: ReactNode;
}) {
  const { permission, requestPermission, ref, granted, flashStyle } = camera;
  return (
    <View style={styles.panel}>
      {granted ? (
        <CameraView ref={ref as RefObject<CameraView>} style={StyleSheet.absoluteFill} facing="back" />
      ) : permission && !permission.granted ? (
        <View style={styles.permission}>
          <Icon name="camera" size={28} color={colors.white} />
          <Text variant="heading" tone="white" style={{ textAlign: "center" }}>
            Camera access
          </Text>
          <Text tone="white" style={{ textAlign: "center", opacity: 0.7 }}>
            Photos are only used to scope your job.
          </Text>
          <Button
            label={permission.canAskAgain ? "Allow camera" : "Open settings"}
            variant="secondary"
            compact
            onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
            style={{ marginTop: 8, alignSelf: "stretch" }}
          />
        </View>
      ) : null}

      {previewUri ? (
        <Animated.View entering={FadeIn.duration(120)} style={StyleSheet.absoluteFill}>
          <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.25)" }]} />
        </Animated.View>
      ) : null}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "white" }, flashStyle]} />

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.corner, { top: 28, left: 28, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 12 }]} />
        <View style={[styles.corner, { top: 28, right: 28, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 12 }]} />
        <View style={[styles.corner, { bottom: 28, left: 28, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 12 }]} />
        <View style={[styles.corner, { bottom: 28, right: 28, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 12 }]} />
      </View>

      {status ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.statusWrap} pointerEvents="none">
          <View style={[styles.status, status.bad && { backgroundColor: "rgba(199,58,58,0.9)" }]}>
            {status.done ? <Icon name={status.bad ? "alert-circle" : "check"} size={18} color="white" /> : <ActivityIndicator color="white" />}
            <Text variant="bodyStrong" tone="white">
              {status.text}
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {onLibrary ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Choose from library" onPress={onLibrary} hitSlop={8} style={styles.library}>
          <Icon name="image" size={20} color="white" />
        </Pressable>
      ) : null}
      {children}
    </View>
  );
}

/** The black ring shutter from the design. */
export function Shutter({ onPress, disabled, label = "Take photo" }: { onPress: () => void; disabled?: boolean; label?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.shutter, disabled && { opacity: 0.35 }, pressed && { transform: [{ scale: 0.94 }] }]}
    >
      <View style={styles.shutterInner} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, borderRadius: radius.xl, backgroundColor: colors.camera, overflow: "hidden" },
  corner: { position: "absolute", width: 32, height: 32, borderColor: "rgba(255,255,255,0.7)" },
  permission: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  statusWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: "rgba(22,21,19,0.75)",
    maxWidth: "85%",
  },
  library: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  shutter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.ink },
});
