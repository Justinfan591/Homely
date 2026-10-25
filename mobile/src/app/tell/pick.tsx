import { View } from "react-native";
import { Screen, Title } from "@/components/Screen";
import { ServiceGrid } from "@/components/ServiceGrid";

/** Tell us · "Something else": every category. Keeps what they said or the photo they took. */
export default function Pick() {
  return (
    <Screen>
      <View style={{ marginTop: 16, marginBottom: 28 }}>
        <Title title="What's closest?" />
      </View>
      <ServiceGrid />
    </Screen>
  );
}
