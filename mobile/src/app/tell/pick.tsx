import { View } from "react-native";
import { Screen, Title } from "@/components/Screen";
import { ServiceGrid } from "@/components/ServiceGrid";
import { intake } from "@/hooks/intake";

/** Tell us · not quite ("What's closest?"). */
export default function Pick() {
  return (
    <Screen>
      <View style={{ marginTop: 16, marginBottom: 28 }}>
        <Title title="What's closest?" />
      </View>
      <ServiceGrid description={intake.text || null} />
    </Screen>
  );
}
