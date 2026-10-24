import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { goHomeTab } from "@/components/Screen";
import { Text } from "@/components/Text";
import { windowLabel } from "@/domain/format";
import { useJob } from "@/hooks/data";
import { colors, gutter } from "@/theme";

/** Book · confirmed */
export default function Booked() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { data: job } = useJob(jobId);
  const insets = useSafeAreaInsets();
  const when = job?.slot ? windowLabel(job.slot.start) : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <View style={styles.center}>
        <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.check}>
          <Icon name="check" size={44} color={colors.white} />
        </Animated.View>
        <Text variant="display" style={{ marginTop: 28, textAlign: "center" }} accessibilityRole="header">
          You're booked.
        </Text>
        <Text tone="soft" style={{ marginTop: 12, textAlign: "center" }}>
          {job ? [job.providerName, when].filter(Boolean).join(" · ") : " "}
        </Text>
      </View>
      <Button label="Done" onPress={goHomeTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: gutter },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  check: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
});
