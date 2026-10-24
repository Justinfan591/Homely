import { Alert, Platform } from "react-native";

/** Native replacement for the web app's confirm(): resolves true if the user taps the action. */
export function confirmAction(title: string, action = "Yes", destructive = true): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(globalThis.confirm?.(title) ?? true);
  return new Promise((resolve) =>
    Alert.alert(title, undefined, [
      { text: "Not now", style: "cancel", onPress: () => resolve(false) },
      { text: action, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}
