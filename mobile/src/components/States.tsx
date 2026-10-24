import { StyleSheet, View } from "react-native";
import { colors, radius } from "@/theme";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Text } from "./Text";

export function ErrorState({
  message = "Something went wrong.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.center} accessibilityRole="alert">
      <View style={styles.badge}>
        <Icon name="wifi-off" size={24} />
      </View>
      <Text variant="heading" style={styles.text}>
        Couldn't load this
      </Text>
      <Text tone="soft" style={styles.text}>
        {message}
      </Text>
      {onRetry ? <Button label="Try again" onPress={onRetry} variant="secondary" compact style={{ marginTop: 8 }} /> : null}
    </View>
  );
}

export function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <View style={styles.center}>
      <View style={styles.badge}>
        <Icon name={icon} size={24} />
      </View>
      <Text variant="heading" style={styles.text}>
        {title}
      </Text>
      <Text tone="soft" style={styles.text}>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 16, gap: 8 },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.fill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  text: { textAlign: "center" },
});
